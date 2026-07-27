export interface JarvisSessionSummary {
  id: string;
  name?: string;
  status?: string;
  updatedAt?: string;
}

export interface JarvisTask {
  id: string;
  cwd: string;
  title: string;
  prompt: string;
  status: "draft";
  createdAt: string;
}

export interface JarvisBrief {
  workspace: { path: string; label: string; projectName: string };
  projectCount: number;
  workspaceCount: number;
  sessions: JarvisSessionSummary[];
  taskCount: number;
  transcription: { configured: false; message: string };
}
