import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DATA_DIR = process.env.PI_WEB_DATA_DIR ?? "~/.pi-web";
const DEFAULT_STATE_PATH = `${DATA_DIR}/telegram-gateway/state.json`;
let stateWriteQueue = Promise.resolve();

export async function loadConfig(path) {
  const parsed = JSON.parse(await readFile(expandHome(path), "utf8"));
  const token = process.env.TELEGRAM_BOT_TOKEN || stringOrUndefined(parsed.telegramBotToken);
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN env var or telegramBotToken in config");
  const config = {
    telegramBotToken: token,
    piWebBaseUrl: stringOrUndefined(parsed.piWebBaseUrl) ?? "http://127.0.0.1:8504",
    machineId: stringOrUndefined(parsed.machineId) ?? "local",
    defaultCwd: requireAbsolutePath(parsed.defaultCwd, "defaultCwd"),
    workspaceAccessPath: stringOrUndefined(parsed.workspaceAccessPath),
    allowedTelegramUserIds: numberArray(parsed.allowedTelegramUserIds ?? [], "allowedTelegramUserIds"),
    adminTelegramUserIds: numberArray(parsed.adminTelegramUserIds ?? [], "adminTelegramUserIds"),
    userRoutes: recordOrEmpty(parsed.userRoutes),
    statePath: stringOrUndefined(parsed.statePath) ?? DEFAULT_STATE_PATH,
    pollTimeoutSeconds: positiveNumber(parsed.pollTimeoutSeconds, 25),
    requestTimeoutMs: positiveNumber(parsed.requestTimeoutMs, 30_000),
    responseTimeoutMs: positiveNumber(parsed.responseTimeoutMs, 900_000),
    maxTelegramChunk: positiveNumber(parsed.maxTelegramChunk, 3_900),
  };
  if (config.workspaceAccessPath !== undefined) config.workspaceAccessPath = expandHome(config.workspaceAccessPath);
  if (config.allowedTelegramUserIds.length === 0 && config.workspaceAccessPath === undefined) {
    throw new Error("allowedTelegramUserIds must contain at least one Telegram user ID when workspaceAccessPath is not configured");
  }
  validateUserRoutes(config.userRoutes);
  config.statePath = expandHome(config.statePath);
  return config;
}

export async function loadWorkspaceAccess(path) {
  if (path === undefined) return undefined;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const telegramUsers = telegramUsersFromPolicy(recordOrEmpty(parsed.users));
    console.log(`[telegram-gateway] loaded workspace access map from ${path} (${telegramUsers.size} Telegram link${telegramUsers.size === 1 ? "" : "s"})`);
    return { telegramUsers };
  } catch (error) {
    if (error && error.code === "ENOENT") throw new Error(`workspaceAccessPath does not exist: ${path}`);
    throw error;
  }
}

export async function loadState(path) {
  const filePath = expandHome(path ?? DEFAULT_STATE_PATH);
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return { telegramUpdateOffset: parsed.telegramUpdateOffset ?? 0, routes: recordOrEmpty(parsed.routes) };
  } catch (error) {
    if (error && error.code === "ENOENT") return { telegramUpdateOffset: 0, routes: {} };
    throw error;
  }
}

export function saveState(path, state) {
  const filePath = expandHome(path ?? DEFAULT_STATE_PATH);
  const content = `${JSON.stringify(state, null, 2)}\n`;
  stateWriteQueue = stateWriteQueue.then(() => writeStateAtomically(filePath, content));
  return stateWriteQueue;
}

export function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function writeStateAtomically(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${String(process.pid)}.tmp`;
  await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, filePath);
}

function telegramUsersFromPolicy(users) {
  const telegramUsers = new Map();
  for (const [userId, user] of Object.entries(users)) {
    if (!userId) throw new Error("Workspace access user IDs must be non-empty strings");
    if (typeof user !== "object" || user === null || Array.isArray(user)) throw new Error(`Workspace access user ${userId} must be an object`);
    const workspaces = stringArray(user.workspaces, `users.${userId}.workspaces`).map((workspace) => requireAbsolutePath(workspace, `users.${userId}.workspaces[]`));
    const telegramUserIds = numberArray(user.telegramUserIds ?? [], `users.${userId}.telegramUserIds`);
    const label = stringOrUndefined(user.label) ?? userId;
    for (const telegramUserId of telegramUserIds) telegramUsers.set(telegramUserId, { clerkUserId: userId, label, workspaces });
  }
  return telegramUsers;
}

function validateUserRoutes(routes) {
  for (const [userId, route] of Object.entries(routes)) {
    if (!/^\d+$/u.test(userId)) throw new Error(`userRoutes key must be a Telegram numeric user ID: ${userId}`);
    if (route.cwd !== undefined) requireAbsolutePath(route.cwd, `userRoutes.${userId}.cwd`);
  }
}

function expandHome(path) {
  if (path === "~") return process.env.HOME ?? path;
  if (path.startsWith("~/")) return resolve(process.env.HOME ?? ".", path.slice(2));
  return path;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireAbsolutePath(value, name) {
  if (typeof value !== "string" || !value.startsWith("/")) throw new Error(`${name} must be an absolute path`);
  return value;
}

function numberArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number" || !Number.isInteger(item))) {
    throw new Error(`${name} must be an array of numeric Telegram user IDs`);
  }
  return value;
}

function stringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item === "")) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }
  return value;
}

function recordOrEmpty(value) {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected an object");
  return value;
}

function positiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
