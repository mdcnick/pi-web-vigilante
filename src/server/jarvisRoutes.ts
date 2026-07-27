import type { FastifyInstance, FastifyReply } from "fastify";
import type { MachineService } from "./machines/machineService.js";
import { jarvisPage } from "./jarvisPage.js";
import { JarvisService, JarvisWorkspaceNotFoundError, type JarvisServiceDependencies } from "./jarvisService.js";

interface JarvisRoutesDependencies extends JarvisServiceDependencies {
  machines: MachineService;
}

interface CwdQuery {
  cwd?: unknown;
}

interface TaskBody {
  cwd?: unknown;
  title?: unknown;
  prompt?: unknown;
}

export function registerJarvisRoutes(app: FastifyInstance, deps: JarvisRoutesDependencies): void {
  const service = new JarvisService(deps);
  app.get("/jarvis", (_request, reply) => reply.type("text/html; charset=utf-8").send(jarvisPage()));
  registerLocalJarvisApi(app, service, "/api/jarvis");
  registerLocalJarvisApi(app, service, "/api/machines/local/jarvis");
  registerRemoteJarvisApi(app, deps.machines);
}

function registerLocalJarvisApi(app: FastifyInstance, service: JarvisService, prefix: string): void {
  app.get<{ Querystring: CwdQuery }>(`${prefix}/brief`, async (request, reply) => {
    try {
      return await service.brief(request.query.cwd);
    } catch (error) {
      return sendJarvisError(reply, error);
    }
  });

  app.get<{ Querystring: CwdQuery }>(`${prefix}/tasks`, async (request, reply) => {
    try {
      return { tasks: await service.listTasks(request.query.cwd) };
    } catch (error) {
      return sendJarvisError(reply, error);
    }
  });

  app.post<{ Body: TaskBody | undefined }>(`${prefix}/tasks`, async (request, reply) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      const task = await service.createTask({ cwd: body["cwd"], title: body["title"], prompt: body["prompt"] });
      return await reply.code(201).send({ task });
    } catch (error) {
      return sendJarvisError(reply, error);
    }
  });
}

function registerRemoteJarvisApi(app: FastifyInstance, machines: MachineService): void {
  app.get<{ Params: { machineId: string }; Querystring: CwdQuery }>("/api/machines/:machineId/jarvis/brief", (request, reply) => {
    return proxyRemote(machines, request.params.machineId, "GET", remotePath("brief", request.query.cwd), undefined, reply);
  });
  app.get<{ Params: { machineId: string }; Querystring: CwdQuery }>("/api/machines/:machineId/jarvis/tasks", (request, reply) => {
    return proxyRemote(machines, request.params.machineId, "GET", remotePath("tasks", request.query.cwd), undefined, reply);
  });
  app.post<{ Params: { machineId: string }; Body: TaskBody | undefined }>("/api/machines/:machineId/jarvis/tasks", (request, reply) => {
    return proxyRemote(machines, request.params.machineId, "POST", "/api/jarvis/tasks", request.body, reply);
  });
}

async function proxyRemote(machines: MachineService, machineId: string, method: string, path: string, body: unknown, reply: FastifyReply): Promise<FastifyReply> {
  if (machineId === "local") return reply.code(404).send({ error: "Local Jarvis route was not matched" });
  const client = await machines.remoteClient(machineId);
  if (client === undefined) return reply.code(404).send({ error: "Machine not found" });
  try {
    const response = await client.requestJson(method, path, body);
    return await reply.code(response.statusCode).send(response.body);
  } catch (error) {
    return reply.code(502).send({ error: `Remote Jarvis unavailable: ${error instanceof Error ? error.message : String(error)}` });
  }
}

function remotePath(resource: string, cwd: unknown): string {
  const query = new URLSearchParams();
  if (typeof cwd === "string") query.set("cwd", cwd);
  return `/api/jarvis/${resource}?${query.toString()}`;
}

function sendJarvisError(reply: FastifyReply, error: unknown): FastifyReply {
  const status = error instanceof JarvisWorkspaceNotFoundError ? 404 : 400;
  return reply.code(status).send({ error: error instanceof Error ? error.message : String(error) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
