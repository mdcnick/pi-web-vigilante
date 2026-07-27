import { describe, expect, it, vi } from "vitest";
import type { MachineClient } from "./machines/machineClient.js";
import { appTestContext, fakeRemoteClient, registerAppTestHooks } from "./app.testSupport.js";

registerAppTestHooks();

describe("Jarvis routes", () => {
  it("serves the focused Jarvis workspace surface", async () => {
    const response = await appTestContext.app.inject({ method: "GET", url: "/jarvis?embedded=1" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Jarvis");
    expect(response.body).toContain("Voice unavailable");
    expect(response.body).toContain('"api/machines/" + encodeURIComponent(machineId) + "/jarvis"');
    expect(response.body).not.toContain("openai.com");
    expect(response.body).not.toContain("assemblyai");
  });

  it("briefs a registered workspace and keeps tasks scoped to it", async () => {
    await registerProject();
    const cwd = encodeURIComponent(appTestContext.projectDir);

    const brief = await appTestContext.app.inject({ method: "GET", url: `/api/machines/local/jarvis/brief?cwd=${cwd}` });
    const created = await appTestContext.app.inject({
      method: "POST",
      url: "/api/machines/local/jarvis/tasks",
      payload: { cwd: appTestContext.projectDir, title: "Review restore", prompt: "Run the focused Jarvis checks." },
    });
    const tasks = await appTestContext.app.inject({ method: "GET", url: `/api/machines/local/jarvis/tasks?cwd=${cwd}` });

    expect(brief.statusCode).toBe(200);
    expect(brief.json()).toMatchObject({
      workspace: { path: appTestContext.projectDir },
      projectCount: 1,
      workspaceCount: 1,
      sessions: [],
      taskCount: 0,
      transcription: { configured: false },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ task: { cwd: appTestContext.projectDir, title: "Review restore", status: "draft" } });
    expect(tasks.json<{ tasks: unknown[] }>().tasks).toHaveLength(1);
    expect(appTestContext.sessionDaemonRequests).toContainEqual({ method: "GET", path: `/sessions?cwd=${cwd}` });
  });

  it("rejects unknown workspace paths before reading sessions or accepting tasks", async () => {
    const response = await appTestContext.app.inject({ method: "GET", url: "/api/jarvis/brief?cwd=%2Ftmp%2Fnot-registered" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Jarvis workspace is not registered: /tmp/not-registered" });
    expect(appTestContext.sessionDaemonRequests).toEqual([]);
  });

  it("proxies machine-specific Jarvis requests to the selected remote", async () => {
    const added = await appTestContext.app.inject({ method: "POST", url: "/api/machines", payload: { name: "Remote", baseUrl: "https://remote.example.test" } });
    const machine = added.json<{ id: string }>();
    const requestJson = vi.fn<MachineClient["requestJson"]>(() => Promise.resolve({ statusCode: 200, headers: {}, body: { tasks: [] } }));
    appTestContext.remoteClient = fakeRemoteClient({ requestJson });

    const response = await appTestContext.app.inject({ method: "GET", url: `/api/machines/${machine.id}/jarvis/tasks?cwd=%2Fsrv%2Frepo` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tasks: [] });
    expect(requestJson).toHaveBeenCalledWith("GET", "/api/jarvis/tasks?cwd=%2Fsrv%2Frepo", undefined);
  });
});

async function registerProject(): Promise<void> {
  const response = await appTestContext.app.inject({
    method: "POST",
    url: "/api/projects",
    payload: { name: "Jarvis Project", path: appTestContext.projectDir, create: true },
  });
  expect(response.statusCode).toBe(200);
}
