import { randomUUID } from "node:crypto";
import type { ProjectService } from "./projects/projectService.js";
import type { SessionProxyDaemon } from "./sessiond/sessionProxyRoutes.js";
import type { WorkspaceService } from "./workspaces/workspaceService.js";
import { normalizeRequestCwd } from "./workingDirectory.js";
import type { JarvisBrief, JarvisSessionSummary, JarvisTask } from "./jarvisTypes.js";

const MAX_TASKS_PER_WORKSPACE = 200;

export interface JarvisServiceDependencies {
  projects: ProjectService;
  workspaces: WorkspaceService;
  sessionDaemon: SessionProxyDaemon;
  now?: () => Date;
  createId?: () => string;
}

interface KnownWorkspace {
  path: string;
  label: string;
  projectName: string;
}

export class JarvisService {
  private readonly tasks = new Map<string, JarvisTask>();
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly deps: JarvisServiceDependencies) {
    this.now = deps.now ?? (() => new Date());
    this.createId = deps.createId ?? randomUUID;
  }

  async brief(cwdInput: unknown): Promise<JarvisBrief> {
    const cwd = normalizeRequestCwd(cwdInput);
    const { selected, projectCount, workspaceCount } = await this.requireKnownWorkspace(cwd);
    const sessions = await this.sessions(cwd);
    return {
      workspace: selected,
      projectCount,
      workspaceCount,
      sessions,
      taskCount: this.tasksFor(cwd).length,
      transcription: {
        configured: false,
        message: "Voice transcription is not configured, and no paid provider will be called. Tasks stay in this in-memory draft queue and are never dispatched automatically.",
      },
    };
  }

  async listTasks(cwdInput: unknown): Promise<JarvisTask[]> {
    const cwd = normalizeRequestCwd(cwdInput);
    await this.requireKnownWorkspace(cwd);
    return this.tasksFor(cwd);
  }

  async createTask(input: { cwd: unknown; title: unknown; prompt: unknown }): Promise<JarvisTask> {
    const cwd = normalizeRequestCwd(input.cwd);
    await this.requireKnownWorkspace(cwd);
    const title = requiredText(input.title, "title", 120);
    const prompt = requiredText(input.prompt, "prompt", 4_000);
    if (this.tasksFor(cwd).length >= MAX_TASKS_PER_WORKSPACE) throw new Error("Jarvis task queue is full for this workspace");
    const task: JarvisTask = {
      id: `jtask_${this.createId()}`,
      cwd,
      title,
      prompt,
      status: "draft",
      createdAt: this.now().toISOString(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  private tasksFor(cwd: string): JarvisTask[] {
    return [...this.tasks.values()]
      .filter((task) => task.cwd === cwd)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private async sessions(cwd: string): Promise<JarvisSessionSummary[]> {
    try {
      const response = await this.deps.sessionDaemon.request("GET", `/sessions?cwd=${encodeURIComponent(cwd)}`);
      if (response.statusCode < 200 || response.statusCode >= 300 || response.body === "") return [];
      return sessionSummaries(JSON.parse(response.body));
    } catch {
      return [];
    }
  }

  private async requireKnownWorkspace(cwd: string): Promise<{ selected: KnownWorkspace; projectCount: number; workspaceCount: number }> {
    const projects = await this.deps.projects.list();
    let selected: KnownWorkspace | undefined;
    let workspaceCount = 0;
    for (const project of projects) {
      const workspaces = await this.deps.workspaces.list(project);
      workspaceCount += workspaces.length;
      const workspace = workspaces.find((candidate) => candidate.path === cwd);
      if (workspace !== undefined) selected = { path: workspace.path, label: workspace.label, projectName: project.name };
    }
    if (selected === undefined) throw new JarvisWorkspaceNotFoundError(cwd);
    return { selected, projectCount: projects.length, workspaceCount };
  }
}

export class JarvisWorkspaceNotFoundError extends Error {
  constructor(cwd: string) {
    super(`Jarvis workspace is not registered: ${cwd}`);
  }
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${field} must be ${String(maxLength)} characters or fewer`);
  return text;
}

function sessionSummaries(value: unknown): JarvisSessionSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): JarvisSessionSummary[] => {
    if (!isRecord(entry) || typeof entry["id"] !== "string" || entry["id"] === "") return [];
    const name = optionalString(entry["name"]);
    const updatedAt = optionalString(entry["updatedAt"]) ?? optionalString(entry["modified"]);
    const reportedStatus = optionalString(entry["status"]);
    return [{
      id: entry["id"],
      ...(name === undefined ? {} : { name }),
      status: reportedStatus ?? (entry["archived"] === true ? "archived" : "active"),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    }];
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
