export const JARVIS_PAGE_SCRIPT = `
(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embedded") === "1") document.body.classList.add("embedded");
  const cwd = params.get("cwd") || "";
  const machineId = params.get("machineId") || "local";
  const apiRoot = "api/machines/" + encodeURIComponent(machineId) + "/jarvis";
  const byId = (id) => document.getElementById(id);
  byId("workspacePath").textContent = cwd || "No workspace selected";

  async function request(path, init) {
    const response = await fetch(apiRoot + path, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || response.statusText);
    return body;
  }

  function item(primary, secondary, badge) {
    const node = document.createElement("div");
    node.className = "item";
    const head = document.createElement("div");
    head.className = "item-head";
    const strong = document.createElement("strong");
    strong.textContent = primary;
    const tag = document.createElement("span");
    tag.className = "badge";
    tag.textContent = badge;
    head.append(strong, tag);
    const detail = document.createElement("div");
    detail.className = "subtle";
    detail.textContent = secondary;
    node.append(head, detail);
    return node;
  }

  function showError(error) {
    const notice = byId("notice");
    notice.className = "notice error";
    notice.textContent = error instanceof Error ? error.message : String(error);
  }

  async function loadBrief() {
    if (!cwd) return showError(new Error("Open Jarvis from a registered workspace."));
    try {
      const query = "?" + new URLSearchParams({ cwd }).toString();
      const brief = await request("/brief" + query);
      byId("workspaceName").textContent = brief.workspace.projectName + " / " + brief.workspace.label;
      byId("projectCount").textContent = String(brief.projectCount);
      byId("workspaceCount").textContent = String(brief.workspaceCount);
      byId("sessionCount").textContent = String(brief.sessions.length);
      byId("notice").textContent = brief.transcription.message;
      const sessions = byId("sessions");
      sessions.replaceChildren();
      if (brief.sessions.length === 0) sessions.append(empty("No active sessions reported."));
      for (const session of brief.sessions) sessions.append(item(session.name || session.id, session.updatedAt || session.id, session.status || "active"));
      await loadTasks();
    } catch (error) {
      showError(error);
    }
  }

  async function loadTasks() {
    const tasksNode = byId("tasks");
    try {
      const query = "?" + new URLSearchParams({ cwd }).toString();
      const body = await request("/tasks" + query);
      tasksNode.replaceChildren();
      if (body.tasks.length === 0) tasksNode.append(empty("No Jarvis tasks in this workspace."));
      for (const task of body.tasks) tasksNode.append(item(task.title, task.prompt, task.status));
    } catch (error) {
      showError(error);
    }
  }

  function empty(text) {
    const node = document.createElement("p");
    node.className = "empty";
    node.textContent = text;
    return node;
  }

  byId("refresh").addEventListener("click", () => void loadBrief());
  byId("taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = byId("createTask");
    button.disabled = true;
    try {
      await request("/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cwd, title: form.get("title"), prompt: form.get("prompt") }),
      });
      event.currentTarget.reset();
      await loadBrief();
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  });
  void loadBrief();
})();
`;
