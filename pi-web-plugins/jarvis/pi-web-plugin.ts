import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";
import { jarvisPagePath } from "./jarvisPaths.js";

const plugin: PiWebPlugin = {
  apiVersion: 1,
  name: "Jarvis",
  activate: ({ pluginId, html, svg }) => ({
    contributions: {
      actions: [
        {
          id: "workspace.open-jarvis",
          title: "Open Jarvis",
          description: "Open the Jarvis brief and task queue for this workspace.",
          group: "Workspace",
          enabled: (context) => context.state.selectedWorkspace !== undefined,
          run: (context) => {
            if (context.state.selectedWorkspace === undefined) return;
            context.selectWorkspaceTool(`${pluginId}:workspace.jarvis`);
          },
        },
      ],
      workspacePanels: [
        {
          id: "workspace.jarvis",
          title: "Jarvis",
          order: 15,
          icon: svg`
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
              <path d="M12 18v3"></path><path d="M8 21h8"></path>
            </svg>
          `,
          render: (context) => html`
            <iframe
              title="Jarvis workspace brief"
              src=${jarvisPagePath(context.machine.id, context.workspace.path)}
              style="width:100%;height:calc(100dvh - 150px);min-height:640px;border:0;border-radius:16px;background:#070a12;display:block;"
              sandbox="allow-scripts allow-same-origin"
              referrerpolicy="no-referrer"
            ></iframe>
          `,
        },
      ],
    },
  }),
};

export default plugin;
