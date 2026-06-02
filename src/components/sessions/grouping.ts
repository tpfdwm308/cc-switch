import type { SessionMeta } from "@/types";
import { getBaseName } from "./utils";

export interface SessionFolderGroup {
  /** Stable grouping key: normalized projectDir, or "" for the unknown group. */
  key: string;
  /** Original projectDir for display/tooltip; null when unknown. */
  dir: string | null;
  /** Folder base name for display; "" for the unknown group (caller localizes). */
  label: string;
  sessions: SessionMeta[];
  /** Most recent activity in the group (ms), used for ordering. */
  lastActiveAt: number;
}

const sessionTime = (session: SessionMeta) =>
  session.lastActiveAt ?? session.createdAt ?? 0;

/**
 * Normalize a project directory into a grouping key so the same folder
 * referenced as "C:\\X", "c:/x" or "C:\\X\\" lands in one group.
 * Returns "" for empty/missing input (the unknown group).
 */
export const normalizeFolderKey = (dir?: string | null): string => {
  if (!dir) return "";
  const trimmed = dir.trim();
  if (!trimmed) return "";
  // strip trailing separators and unify path separators
  const normalized = trimmed.replace(/[\\/]+$/, "").replace(/\\/g, "/");
  // Windows paths are case-insensitive: when this looks like a Windows path
  // (drive-letter prefix or original backslashes), fold case so the same
  // folder referenced with different casing groups together. POSIX paths stay
  // case-sensitive. Display still uses the original casing from each session.
  const isWindowsPath =
    /^[a-zA-Z]:/.test(normalized) || trimmed.includes("\\");
  return isWindowsPath ? normalized.toLowerCase() : normalized;
};

/**
 * Group sessions by their project directory.
 * - Sessions sharing a (normalized) projectDir are grouped together.
 * - Sessions without a projectDir collapse into a single unknown group (key "").
 * - Groups are ordered by most-recent activity (desc); the unknown group sinks last.
 * - Sessions within a group are ordered by most-recent activity (desc).
 *
 * Pure and deterministic (no Date/Math.random) so it is unit-testable.
 */
export const groupSessionsByFolder = (
  sessions: SessionMeta[],
): SessionFolderGroup[] => {
  const map = new Map<string, SessionFolderGroup>();

  for (const session of sessions) {
    const key = normalizeFolderKey(session.projectDir);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        dir: key ? (session.projectDir ?? null) : null,
        label: key ? getBaseName(session.projectDir) : "",
        sessions: [],
        lastActiveAt: 0,
      };
      map.set(key, group);
    }
    group.sessions.push(session);
    const ts = sessionTime(session);
    if (ts > group.lastActiveAt) group.lastActiveAt = ts;
  }

  const groups = Array.from(map.values());

  for (const group of groups) {
    group.sessions.sort((a, b) => sessionTime(b) - sessionTime(a));
  }

  groups.sort((a, b) => {
    // unknown group always sinks to the bottom
    if (a.key === "" && b.key !== "") return 1;
    if (b.key === "" && a.key !== "") return -1;
    if (b.lastActiveAt !== a.lastActiveAt) {
      return b.lastActiveAt - a.lastActiveAt;
    }
    return a.label.localeCompare(b.label);
  });

  return groups;
};
