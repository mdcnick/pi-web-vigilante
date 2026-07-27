import type { SessionInfo } from "./api";

export interface SessionRow {
  session: SessionInfo;
  depth: number;
  hasMissingParent: boolean;
}

export function allDescendantCounts(sessions: readonly SessionInfo[]): Map<string, number> {
  return descendantCounts(sessions, () => true);
}

export function unarchivedDescendantCounts(sessions: readonly SessionInfo[]): Map<string, number> {
  return descendantCounts(sessions, (session) => session.archived !== true);
}

export function sessionRowsForCurrentTree(
  sessions: readonly SessionInfo[],
  expandedSessionPaths: ReadonlySet<string> = new Set(),
): SessionRow[] {
  const visible = sessionIdsForCurrentTree(sessions);
  return sessionRows(sessions.filter((session) => visible.has(session.id)), expandedSessionPaths);
}

export function sessionIdsForCurrentTree(sessions: readonly SessionInfo[]): Set<string> {
  const byPath = new Map(sessions.map((session) => [session.path, session]));
  const visible = new Set<string>();
  for (const session of sessions) {
    if (session.archived === true) continue;
    visible.add(session.id);
    addAncestorIds(session, byPath, visible);
  }
  return visible;
}

export function sessionRows(
  sessions: readonly SessionInfo[],
  expandedSessionPaths: ReadonlySet<string>,
): SessionRow[] {
  const byPath = new Map(sessions.map((session) => [session.path, session]));
  const childrenByPath = childSessionsByParentPath(sessions);
  const roots = sessions.filter((session) => session.parentSessionPath === undefined || !byPath.has(session.parentSessionPath));
  const rows: SessionRow[] = [];
  for (const root of roots) appendVisibleRows(root, 0, new Set(), byPath, childrenByPath, expandedSessionPaths, rows);
  return rows;
}

function addAncestorIds(session: SessionInfo, byPath: ReadonlyMap<string, SessionInfo>, visible: Set<string>): void {
  let parentPath = session.parentSessionPath;
  const seenPaths = new Set<string>([session.path]);
  while (parentPath !== undefined && !seenPaths.has(parentPath)) {
    seenPaths.add(parentPath);
    const parent = byPath.get(parentPath);
    if (parent === undefined) break;
    visible.add(parent.id);
    parentPath = parent.parentSessionPath;
  }
}

function childSessionsByParentPath(sessions: readonly SessionInfo[]): Map<string, SessionInfo[]> {
  const childrenByPath = new Map<string, SessionInfo[]>();
  for (const session of sessions) {
    if (session.parentSessionPath === undefined) continue;
    const children = childrenByPath.get(session.parentSessionPath) ?? [];
    children.push(session);
    childrenByPath.set(session.parentSessionPath, children);
  }
  return childrenByPath;
}

function appendVisibleRows(
  session: SessionInfo,
  depth: number,
  stack: ReadonlySet<string>,
  byPath: ReadonlyMap<string, SessionInfo>,
  childrenByPath: ReadonlyMap<string, SessionInfo[]>,
  expandedSessionPaths: ReadonlySet<string>,
  rows: SessionRow[],
): void {
  if (stack.has(session.path)) return;
  const parentPath = session.parentSessionPath;
  rows.push({ session, depth, hasMissingParent: parentPath !== undefined && !byPath.has(parentPath) });
  if (!expandedSessionPaths.has(session.path)) return;
  const nextStack = new Set(stack);
  nextStack.add(session.path);
  for (const child of childrenByPath.get(session.path) ?? []) {
    appendVisibleRows(child, depth + 1, nextStack, byPath, childrenByPath, expandedSessionPaths, rows);
  }
}

function descendantCounts(
  sessions: readonly SessionInfo[],
  includes: (session: SessionInfo) => boolean,
): Map<string, number> {
  const childrenByPath = childSessionsByParentPath(sessions);
  const countFor = (session: SessionInfo, seenPaths: ReadonlySet<string>): number => {
    if (seenPaths.has(session.path)) return 0;
    const nextSeenPaths = new Set(seenPaths);
    nextSeenPaths.add(session.path);
    let count = 0;
    for (const child of childrenByPath.get(session.path) ?? []) {
      if (nextSeenPaths.has(child.path)) continue;
      if (includes(child)) count += 1;
      count += countFor(child, nextSeenPaths);
    }
    return count;
  };
  return new Map(sessions.map((session) => [session.id, countFor(session, new Set())]));
}
