import { describe, it, expect } from "vitest";
import type { ToolTarget, McpServerConfig, ClaudeConfig, Profile, Snapshot, CommandError } from "./index";

describe("TypeScript types smoke test", () => {
  it("ToolTarget accepts valid values", () => {
    const code: ToolTarget = "code";
    const desktop: ToolTarget = "desktop";
    expect(code).toBe("code");
    expect(desktop).toBe("desktop");
  });

  it("McpServerConfig has required fields", () => {
    const config: McpServerConfig = {
      command: "npx",
      args: ["-y", "some-mcp"],
    };
    expect(config.command).toBe("npx");
    expect(config.args).toHaveLength(2);
    expect(config.env).toBeUndefined();
    expect(config.disabled).toBeUndefined();
  });

  it("ClaudeConfig holds mcpServers record", () => {
    const cfg: ClaudeConfig = {
      mcpServers: {
        myServer: { command: "npx", args: [] },
      },
    };
    expect(Object.keys(cfg.mcpServers)).toHaveLength(1);
  });

  it("Profile has required fields", () => {
    const profile: Profile = {
      id: "abc",
      name: "Default",
      activeMcps: ["server1"],
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(profile.id).toBe("abc");
    expect(profile.activeMcps).toHaveLength(1);
  });

  it("Snapshot has required fields", () => {
    const snap: Snapshot = {
      id: "snap-1",
      name: "Before edit",
      timestamp: "2026-01-01T00:00:00Z",
      tool: "code",
      content: "{}",
      isAuto: true,
    };
    expect(snap.isAuto).toBe(true);
  });

  it("CommandError has type discriminant", () => {
    const err: CommandError = {
      type: "FileNotFound",
      path: "/some/path",
    };
    expect(err.type).toBe("FileNotFound");
  });
});
