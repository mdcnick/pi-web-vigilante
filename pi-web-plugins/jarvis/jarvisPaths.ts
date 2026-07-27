export function jarvisPagePath(machineId: string, cwd: string): string {
  const query = new URLSearchParams({ embedded: "1", machineId, cwd });
  return `jarvis?${query.toString()}`;
}
