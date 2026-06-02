import { describe, expect, it } from "vitest";
import {
  groupSessionsByFolder,
  normalizeFolderKey,
} from "@/components/sessions/grouping";
import type { SessionMeta } from "@/types";

const makeSession = (overrides: Partial<SessionMeta>): SessionMeta => ({
  providerId: "claude",
  sessionId: Math.abs(
    `${overrides.sessionId ?? overrides.projectDir ?? ""}`.length,
  ).toString(),
  ...overrides,
});

describe("normalizeFolderKey", () => {
  it("returns empty string for nullish/blank input", () => {
    expect(normalizeFolderKey(undefined)).toBe("");
    expect(normalizeFolderKey(null)).toBe("");
    expect(normalizeFolderKey("   ")).toBe("");
  });

  it("treats the same Windows folder with different casing/slashes as one key", () => {
    const a = normalizeFolderKey("C:\\Users\\tpf");
    const b = normalizeFolderKey("c:/Users/tpf/");
    expect(a).toBe(b);
    expect(a).toBe("c:/users/tpf");
  });

  it("preserves POSIX paths", () => {
    expect(normalizeFolderKey("/home/me/project/")).toBe("/home/me/project");
  });
});

describe("groupSessionsByFolder", () => {
  it("groups sessions sharing a project directory", () => {
    const sessions: SessionMeta[] = [
      makeSession({ sessionId: "a", projectDir: "C:\\Users\\tpf", lastActiveAt: 10 }),
      makeSession({ sessionId: "b", projectDir: "c:/users/tpf/", lastActiveAt: 30 }),
      makeSession({ sessionId: "c", projectDir: "g:\\WileyDesign\\WileyDesign - 525", lastActiveAt: 20 }),
    ];

    const groups = groupSessionsByFolder(sessions);
    expect(groups).toHaveLength(2);

    const tpf = groups.find((g) => g.label === "tpf");
    expect(tpf?.sessions.map((s) => s.sessionId)).toEqual(["b", "a"]); // sorted by recency desc
    expect(tpf?.lastActiveAt).toBe(30);

    const wiley = groups.find((g) => g.label === "WileyDesign - 525");
    expect(wiley?.sessions).toHaveLength(1);
  });

  it("collapses sessions without a project directory into a single unknown group that sinks last", () => {
    const sessions: SessionMeta[] = [
      makeSession({ sessionId: "u1", projectDir: null, lastActiveAt: 999 }),
      makeSession({ sessionId: "u2", projectDir: undefined, lastActiveAt: 5 }),
      makeSession({ sessionId: "k", projectDir: "/work/app", lastActiveAt: 1 }),
    ];

    const groups = groupSessionsByFolder(sessions);
    expect(groups).toHaveLength(2);

    // unknown group is last even though it has the most recent activity
    const last = groups[groups.length - 1];
    expect(last.key).toBe("");
    expect(last.dir).toBeNull();
    expect(last.sessions.map((s) => s.sessionId)).toEqual(["u1", "u2"]);
  });

  it("orders groups by most-recent activity (desc)", () => {
    const sessions: SessionMeta[] = [
      makeSession({ sessionId: "old", projectDir: "/a", lastActiveAt: 1 }),
      makeSession({ sessionId: "new", projectDir: "/b", lastActiveAt: 100 }),
      makeSession({ sessionId: "mid", projectDir: "/c", createdAt: 50 }),
    ];

    const groups = groupSessionsByFolder(sessions);
    expect(groups.map((g) => g.label)).toEqual(["b", "c", "a"]);
  });

  it("returns an empty array for no sessions", () => {
    expect(groupSessionsByFolder([])).toEqual([]);
  });
});
