import { JARVIS_PAGE_SCRIPT } from "./jarvisPageScript.js";
import { JARVIS_PAGE_STYLES } from "./jarvisPageStyles.js";

export function jarvisPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Jarvis</title>
  <style>${JARVIS_PAGE_STYLES}</style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Jarvis</h1>
        <div id="workspaceName" class="subtle">Workspace brief</div>
        <div id="workspacePath" class="subtle"></div>
      </div>
      <div class="actions">
        <button id="voice" class="secondary" type="button" disabled title="No transcription provider is configured">Voice unavailable</button>
        <button id="refresh" type="button">Refresh brief</button>
      </div>
    </header>
    <div class="grid">
      <section class="panel">
        <h2>Current brief</h2>
        <div class="summary">
          <div class="metric"><strong id="projectCount">–</strong>Projects</div>
          <div class="metric"><strong id="workspaceCount">–</strong>Workspaces</div>
          <div class="metric"><strong id="sessionCount">–</strong>Sessions here</div>
        </div>
        <div id="notice" class="notice">Loading the trusted local workspace context…</div>
        <h2 style="margin-top:20px">Workspace sessions</h2>
        <div id="sessions" class="list"><p class="empty">Loading sessions…</p></div>
      </section>
      <section class="panel">
        <h2>Task queue</h2>
        <form id="taskForm">
          <label>Title<input name="title" maxlength="120" required></label>
          <label>Brief<textarea name="prompt" maxlength="4000" required></textarea></label>
          <button id="createTask" type="submit">Add task</button>
        </form>
        <h2 style="margin-top:22px">Ready tasks</h2>
        <div id="tasks" class="list"><p class="empty">Loading tasks…</p></div>
      </section>
    </div>
  </main>
  <script>${JARVIS_PAGE_SCRIPT}</script>
</body>
</html>`;
}
