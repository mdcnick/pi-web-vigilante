import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";

/**
 * Agent Browser plugin.
 *
 * Adds a "Browser" workspace panel that embeds the local agent-browser-viewer
 * (tools/agent-browser-viewer in the central workspace). The viewer shows the
 * shared Chromium that agents drive through the `playwright-visible` MCP
 * server (CDP on 127.0.0.1:9222), so the user can watch agent browsing live
 * and take over with mouse/keyboard at any time.
 *
 * NOTE: the viewer URL is loopback. It only renders when the PI WEB page is
 * opened from the same machine that runs agent-browser-viewer.
 */
const VIEWER_URL = "http://127.0.0.1:9333/";
const PANEL_ID = "workspace.agent-browser";

const plugin: PiWebPlugin = {
  apiVersion: 1,
  name: "Agent Browser",
  activate: ({ html, svg }) => ({
    contributions: {
      actions: [
        {
          id: "open-agent-browser",
          title: "Open Agent Browser",
          description: "Switch to the shared visible agent browser panel.",
          group: "Agent Browser",
          enabled: (context) => context.state.selectedWorkspace !== undefined,
          disabledReason: () => "Select a workspace first.",
          run: (context) => {
            context.selectWorkspaceTool(`agent-browser:${PANEL_ID}`);
          },
        },
        {
          id: "popout-agent-browser",
          title: "Pop Out Agent Browser",
          description: "Open the agent browser viewer in a new browser tab.",
          group: "Agent Browser",
          run: () => {
            window.open(VIEWER_URL, "_blank", "noopener");
          },
        },
      ],
      workspacePanels: [
        {
          id: PANEL_ID,
          title: "Browser",
          order: 80,
          icon: svg`
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M3 12h18"></path>
              <path d="M12 3a15 15 0 0 1 0 18"></path>
              <path d="M12 3a15 15 0 0 0 0 18"></path>
            </svg>
          `,
          render: (context) => html`
            <section class="toolbar" style="display:flex;align-items:center;gap:12px;">
              <strong>Agent Browser</strong>
              <span class="muted">Shared visible Chromium — agents drive it, you can take over.</span>
              <a href=${VIEWER_URL} target="_blank" rel="noopener">pop out</a>
              <button
                @click=${() =>
                  context.terminal.runCommand({
                    title: "Restart agent browser",
                    command: "systemctl --user restart agent-browser-viewer.service",
                    open: true,
                    metadata: { source: "agent-browser" },
                  })}
              >
                restart
              </button>
            </section>
            <section class="viewer" style="padding:0;display:flex;flex-direction:column;height:100%;">
              <iframe
                src=${VIEWER_URL}
                title="Agent browser viewer"
                style="border:0;flex:1;width:100%;min-height:400px;background:#fff;"
                allow="clipboard-read; clipboard-write"
              ></iframe>
            </section>
          `,
        },
      ],
      workspaceLabels: [
        {
          id: "agent-browser",
          order: 30,
          items: () => [{ type: "text", text: "browser", title: "Agent Browser panel available" }],
        },
      ],
    },
  }),
};

export default plugin;
