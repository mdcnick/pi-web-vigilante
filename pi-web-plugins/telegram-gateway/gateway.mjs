#!/usr/bin/env node
import { setTimeout as sleep } from "node:timers/promises";
import { formatError, loadConfig, loadState, loadWorkspaceAccess, saveState } from "./gateway-config.mjs";
import { PiWebClient, TelegramClient } from "./gateway-clients.mjs";

const DATA_DIR = process.env.PI_WEB_DATA_DIR ?? "~/.pi-web";
const DEFAULT_CONFIG_PATH = `${DATA_DIR}/telegram-gateway/config.json`;

main().catch((error) => {
  console.error(`[telegram-gateway] fatal: ${formatError(error)}`);
  process.exitCode = 1;
});

async function main() {
  const config = await loadConfig(getArg("--config") ?? process.env.TELEGRAM_GATEWAY_CONFIG ?? DEFAULT_CONFIG_PATH);
  const access = await loadWorkspaceAccess(config.workspaceAccessPath);
  const state = await loadState(config.statePath);
  const gateway = new TelegramPiWebGateway(config, state, access);
  await gateway.run();
}

class TelegramPiWebGateway {
  constructor(config, state, access) {
    this.config = config;
    this.state = state;
    this.access = access;
    this.telegramClient = new TelegramClient(config);
    this.piWeb = new PiWebClient(config);
    this.offset = state.telegramUpdateOffset ?? 0;
    this.running = true;
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());
  }

  async run() {
    console.log(`[telegram-gateway] starting; PI WEB=${this.config.piWebBaseUrl}, machine=${this.config.machineId}`);
    await this.telegram("getMe", {});
    while (this.running) {
      try {
        const updates = await this.telegram("getUpdates", {
          offset: this.offset,
          timeout: this.config.pollTimeoutSeconds,
          allowed_updates: ["message"],
        }, { timeoutMs: (this.config.pollTimeoutSeconds + 10) * 1000 });
        for (const update of updates) {
          await this.handleUpdate(update);
          await this.acknowledgeUpdate(update);
        }
      } catch (error) {
        console.error(`[telegram-gateway] polling error: ${formatError(error)}`);
        await sleep(3000);
      }
    }
    await saveState(this.config.statePath, this.state);
    console.log("[telegram-gateway] stopped");
  }

  stop() {
    this.running = false;
  }

  async acknowledgeUpdate(update) {
    if (typeof update.update_id !== "number") return;
    this.offset = update.update_id + 1;
    this.state.telegramUpdateOffset = this.offset;
    await saveState(this.config.statePath, this.state);
  }

  async handleUpdate(update) {
    const message = update.message;
    if (!message || typeof message.text !== "string") return;

    const from = message.from;
    const chat = message.chat;
    if (!from || typeof from.id !== "number" || !chat || typeof chat.id !== "number") return;

    const route = this.routeFor(from.id, chat.id);
    if (!route.allowed) {
      console.warn(`[telegram-gateway] denied user=${from.id} chat=${chat.id}`);
      await this.sendMessage(chat.id, "This bot is private. Ask the owner to link your Telegram account to an allowed workspace.");
      return;
    }

    const text = message.text.trim();

    try {
      if (text === "/start" || text === "/help") {
        await this.sendMessage(chat.id, helpText(route));
      } else if (text === "/status") {
        await this.sendMessage(chat.id, this.statusText(from.id, chat.id, route));
      } else if (text === "/new" || text === "/reset") {
        const session = await this.createSession(route.cwd);
        this.setSession(from.id, chat.id, route.cwd, session.id);
        await this.sendMessage(chat.id, `Started a fresh PI WEB session.\nSession: ${session.id}\nWorkspace: ${route.cwd}`);
      } else if (text.startsWith("/setcwd")) {
        await this.handleSetCwd(from.id, chat.id, text);
      } else if (text.startsWith("/")) {
        await this.sendMessage(chat.id, "Unknown command. Try /help.");
      } else {
        await this.forwardPrompt(from.id, chat.id, text, route);
      }
    } catch (error) {
      console.error(`[telegram-gateway] message error user=${from.id} chat=${chat.id}: ${formatError(error)}`);
      await this.sendMessage(chat.id, "The gateway could not complete that request. The owner can check the private gateway logs.");
    }
  }

  async handleSetCwd(userId, chatId, text) {
    if (!this.isAdmin(userId)) {
      await this.sendMessage(chatId, "/setcwd is admin-only.");
      return;
    }
    const cwd = text.replace(/^\/setcwd(?:@\w+)?\s*/u, "").trim();
    if (!cwd.startsWith("/")) {
      await this.sendMessage(chatId, "Usage: /setcwd /absolute/workspace/path");
      return;
    }
    const route = this.routeFor(userId, chatId);
    if (route.allowedWorkspaces.length > 0 && !route.allowedWorkspaces.includes(cwd)) {
      await this.sendMessage(chatId, `That workspace is not assigned to this user. Allowed:\n${route.allowedWorkspaces.join("\n")}`);
      return;
    }
    const key = routeKey(userId, chatId);
    const existing = this.state.routes[key] ?? {};
    this.state.routes[key] = { ...existing, cwd, sessionId: undefined };
    await saveState(this.config.statePath, this.state);
    await this.sendMessage(chatId, `Workspace changed for this chat. Use /new to start there now.\n${cwd}`);
  }

  async forwardPrompt(userId, chatId, text, route) {
    const sessionId = await this.ensureSession(userId, chatId, route.cwd);
    const status = await this.piWeb.request(`/sessions/${encodeURIComponent(sessionId)}/status?cwd=${encodeURIComponent(route.cwd)}`);
    if (status.isStreaming || status.isCompacting) {
      await this.piWeb.request(`/sessions/${encodeURIComponent(sessionId)}/prompt`, {
        method: "POST",
        body: { cwd: route.cwd, text, streamingBehavior: "followUp" },
      });
      await this.sendMessage(chatId, "Queued behind the current PI response.");
      return;
    }

    const typing = this.keepTyping(chatId);
    try {
      const reply = await this.piWeb.promptAndCollect(sessionId, route.cwd, text);
      await this.sendLongMessage(chatId, reply || "Done.");
    } finally {
      typing.stop();
    }
  }

  async ensureSession(userId, chatId, cwd) {
    const key = routeKey(userId, chatId);
    const existing = this.state.routes[key];
    if (existing?.sessionId && existing.cwd === cwd) {
      try {
        await this.piWeb.request(`/sessions/${encodeURIComponent(existing.sessionId)}/status?cwd=${encodeURIComponent(cwd)}`);
        return existing.sessionId;
      } catch {
        // Session disappeared or machine restarted; create a replacement below.
      }
    }
    const session = await this.createSession(cwd);
    this.setSession(userId, chatId, cwd, session.id);
    return session.id;
  }

  async createSession(cwd) {
    return await this.piWeb.createSession(cwd);
  }

  setSession(userId, chatId, cwd, sessionId) {
    this.state.routes[routeKey(userId, chatId)] = { cwd, sessionId, updatedAt: new Date().toISOString() };
    void saveState(this.config.statePath, this.state);
  }

  routeFor(userId, chatId) {
    const key = routeKey(userId, chatId);
    const stateRoute = this.state.routes[key];
    const accessUser = this.access?.telegramUsers.get(userId);
    const configRoute = this.config.userRoutes[String(userId)] ?? {};
    const allowedWorkspaces = accessUser?.workspaces ?? [];
    const requestedCwd = stateRoute?.cwd ?? configRoute.cwd ?? allowedWorkspaces[0] ?? this.config.defaultCwd;
    const cwd = allowedWorkspaces.length > 0 && !allowedWorkspaces.includes(requestedCwd) ? allowedWorkspaces[0] : requestedCwd;
    return {
      allowed: accessUser !== undefined || this.config.allowedTelegramUserIds.includes(userId),
      clerkUserId: accessUser?.clerkUserId,
      cwd,
      label: accessUser?.label ?? configRoute.label ?? String(userId),
      sessionId: stateRoute?.sessionId,
      allowedWorkspaces,
    };
  }

  statusText(userId, chatId, route) {
    return [
      "PI WEB Telegram Gateway",
      `User: ${userId}`,
      `Linked account: ${route.clerkUserId ?? "legacy allowlist"}`,
      `Chat: ${chatId}`,
      `Workspace: ${route.cwd}`,
      `Session: ${route.sessionId ?? this.state.routes[routeKey(userId, chatId)]?.sessionId ?? "not started"}`,
      `Machine: ${this.config.machineId}`,
    ].join("\n");
  }

  isAllowed(userId) {
    return this.routeFor(userId, userId).allowed;
  }

  isAdmin(userId) {
    return this.config.adminTelegramUserIds.includes(userId);
  }

  async sendLongMessage(chatId, text) {
    const limit = this.config.maxTelegramChunk;
    const chunks = chunkText(text, limit);
    for (const chunk of chunks) await this.sendMessage(chatId, chunk);
  }

  async sendMessage(chatId, text) {
    await this.telegram("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
  }

  keepTyping(chatId) {
    let stopped = false;
    const loop = async () => {
      while (!stopped) {
        try { await this.telegram("sendChatAction", { chat_id: chatId, action: "typing" }, { timeoutMs: 10000 }); } catch { /* ignore typing failures */ }
        await sleep(4500);
      }
    };
    void loop();
    return { stop: () => { stopped = true; } };
  }

  async telegram(method, payload, options = {}) {
    return await this.telegramClient.call(method, payload, options);
  }
}

function helpText(route) {
  return [
    "PI WEB Telegram Gateway",
    "Send a normal message and I will forward it to your private PI WEB session.",
    "",
    "Commands:",
    "/status - show the mapped workspace/session",
    "/new - start a fresh isolated session",
    "/help - show this help",
    "",
    `Workspace: ${route.cwd}`,
  ].join("\n");
}

function routeKey(userId, chatId) {
  return `${userId}:${chatId}`;
}

function chunkText(text, limit) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    const splitAt = Math.max(1, remaining.lastIndexOf("\n", limit));
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
