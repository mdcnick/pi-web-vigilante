export class TelegramClient {
  constructor(config) {
    this.apiBase = `https://api.telegram.org/bot${encodeURIComponent(config.telegramBotToken)}`;
    this.requestTimeoutMs = config.requestTimeoutMs;
  }

  async call(method, payload, options = {}) {
    const result = await fetchJson(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }, options.timeoutMs ?? this.requestTimeoutMs);
    if (result.ok !== true) throw new Error(`Telegram ${method} failed: ${result.description ?? "unknown error"}`);
    return result.result;
  }
}

export class PiWebClient {
  constructor(config) {
    this.baseUrl = config.piWebBaseUrl.replace(/\/$/u, "");
    this.machineId = config.machineId;
    this.requestTimeoutMs = config.requestTimeoutMs;
    this.responseTimeoutMs = config.responseTimeoutMs;
  }

  async request(path, options = {}) {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    return await fetchJson(this.httpUrl(path), {
      method: options.method ?? "GET",
      headers: { "content-type": "application/json" },
      body,
    }, this.requestTimeoutMs);
  }

  async createSession(cwd) {
    return await this.request("/sessions", { method: "POST", body: { cwd } });
  }

  async promptAndCollect(sessionId, cwd, text) {
    const path = `/sessions/${encodeURIComponent(sessionId)}/events?cwd=${encodeURIComponent(cwd)}`;
    const socket = new WebSocket(this.webSocketUrl(path));
    const response = collectAssistantResponse(socket, this.responseTimeoutMs);
    socket.addEventListener("open", () => {
      void this.request(`/sessions/${encodeURIComponent(sessionId)}/prompt`, {
        method: "POST",
        body: { cwd, text },
      }).catch((error) => socket.close(4_000, error instanceof Error ? error.message : String(error)));
    });
    try {
      return await response;
    } finally {
      try { socket.close(); } catch { /* noop */ }
    }
  }

  httpUrl(path) {
    return `${this.baseUrl}/api/machines/${encodeURIComponent(this.machineId)}${path}`;
  }

  webSocketUrl(path) {
    const url = new URL(this.httpUrl(path));
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
}

async function fetchJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    const data = text === "" ? {} : JSON.parse(text);
    if (!response.ok) throw new Error(data.error ? `${response.status} ${data.error}` : `${response.status} ${response.statusText}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function collectAssistantResponse(socket, timeoutMs) {
  const chunks = [];
  let sawAgentStart = false;
  let finished = false;
  let failure;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for PI WEB response")), timeoutMs);
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data.type === "agent.start") sawAgentStart = true;
        if (data.type === "assistant.delta" && sawAgentStart && typeof data.text === "string") chunks.push(data.text);
        if (data.type === "session.error") failure = new Error(String(data.message ?? "PI WEB session error"));
        if (data.type === "agent.end" && sawAgentStart) {
          finished = true;
          clearTimeout(timer);
          resolve(chunks.join("").trim());
        }
      } catch (error) {
        failure = error;
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("PI WEB session WebSocket failed"));
    });
    socket.addEventListener("close", (event) => {
      if (finished) return;
      clearTimeout(timer);
      reject(failure ?? new Error(event.reason || "PI WEB session WebSocket closed before response completed"));
    });
  });
}
