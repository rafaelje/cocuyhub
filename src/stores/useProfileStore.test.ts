import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: { getState: vi.fn() },
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));

import { useConfigStore } from "@/stores/useConfigStore";
import { invokeCommand } from "@/lib/ipc";
import { useProfileStore } from "./useProfileStore";

const mockConfigGetState = vi.mocked(useConfigStore).getState as ReturnType<
  typeof vi.fn
>;
const mockInvokeCommand = vi.mocked(invokeCommand);

describe("useProfileStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfileStore.setState({ profiles: [], activeProfileId: null, isLoading: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with empty profiles array", () => {
    expect(useProfileStore.getState().profiles).toEqual([]);
  });

  it("initializes with null activeProfileId", () => {
    expect(useProfileStore.getState().activeProfileId).toBeNull();
  });

  it("computeMixedState returns false when activeProfileId is null", () => {
    expect(useProfileStore.getState().computeMixedState("code")).toBe(false);
  });

  it("computeMixedState returns false when activeProfileId is null for desktop", () => {
    expect(useProfileStore.getState().computeMixedState("desktop")).toBe(false);
  });

  it("computeMixedState returns false when active profile not found in profiles array", () => {
    useProfileStore.setState({ profiles: [], activeProfileId: "nonexistent" });
    // No mock needed — returns early before calling getState()
    expect(useProfileStore.getState().computeMixedState("code")).toBe(false);
  });

  it("computeMixedState returns false when config is null", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          activeMcps: [],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({ codeConfig: null });
    expect(useProfileStore.getState().computeMixedState("code")).toBe(false);
  });

  it("computeMixedState returns false when enabled MCPs exactly match profile", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          activeMcps: ["mcp-a", "mcp-b"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({
      codeConfig: {
        mcpServers: {
          "mcp-a": { command: "node", args: [] },
          "mcp-b": { command: "node", args: [] },
        },
      },
    });
    expect(useProfileStore.getState().computeMixedState("code")).toBe(false);
  });

  it("computeMixedState returns true when an MCP is disabled but profile expects it enabled", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          activeMcps: ["mcp-a", "mcp-b"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({
      codeConfig: {
        mcpServers: {
          "mcp-a": { command: "node", args: [] },
          "mcp-b": { command: "node", args: [], disabled: true },
        },
      },
    });
    expect(useProfileStore.getState().computeMixedState("code")).toBe(true);
  });

  it("computeMixedState returns true when profile expects fewer MCPs than currently enabled", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          activeMcps: ["mcp-a"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({
      codeConfig: {
        mcpServers: {
          "mcp-a": { command: "node", args: [] },
          "mcp-b": { command: "node", args: [] }, // enabled but not in profile
        },
      },
    });
    expect(useProfileStore.getState().computeMixedState("code")).toBe(true);
  });

  it("computeMixedState uses desktopConfig when tool is desktop", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          activeMcps: ["mcp-a"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({
      codeConfig: null,
      desktopConfig: {
        mcpServers: {
          "mcp-a": { command: "node", args: [] },
        },
      },
    });
    expect(useProfileStore.getState().computeMixedState("desktop")).toBe(false);
  });

  it("computeMixedState handles empty activeMcps and empty config correctly", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Empty",
          activeMcps: [],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({
      codeConfig: { mcpServers: {} },
    });
    expect(useProfileStore.getState().computeMixedState("code")).toBe(false);
  });

  // M1 fix: profile activeMcps has different names than currently enabled MCPs
  it("computeMixedState returns true when profile activeMcps names differ from enabled MCP names", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          activeMcps: ["mcp-a", "mcp-c"], // expects mcp-c, not mcp-b
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({
      codeConfig: {
        mcpServers: {
          "mcp-a": { command: "node", args: [] },
          "mcp-b": { command: "node", args: [] }, // mcp-b enabled, not mcp-c
        },
      },
    });
    // Both have length 2 but names differ: ["mcp-a","mcp-b"] vs ["mcp-a","mcp-c"]
    expect(useProfileStore.getState().computeMixedState("code")).toBe(true);
  });

  it("initializes with isLoading false", () => {
    expect(useProfileStore.getState().isLoading).toBe(false);
  });

  it("fetchProfiles sets profiles from invokeCommand result", async () => {
    const mockProfiles = [
      { id: "p1", name: "Work", activeMcps: ["mcp-a"], createdAt: "2026-01-01T00:00:00Z" },
    ];
    mockInvokeCommand.mockResolvedValue(mockProfiles);
    await useProfileStore.getState().fetchProfiles();
    expect(useProfileStore.getState().profiles).toEqual(mockProfiles);
    expect(useProfileStore.getState().isLoading).toBe(false);
  });

  it("fetchProfiles sets isLoading false on error", async () => {
    mockInvokeCommand.mockRejectedValue(new Error("read error"));
    await useProfileStore.getState().fetchProfiles();
    expect(useProfileStore.getState().isLoading).toBe(false);
  });

  it("addProfile appends a profile to the profiles array", () => {
    const profile = { id: "p1", name: "Work", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.getState().addProfile(profile);
    expect(useProfileStore.getState().profiles).toEqual([profile]);
  });

  it("addProfile preserves existing profiles", () => {
    const p1 = { id: "p1", name: "Work", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.getState().addProfile(p1);
    useProfileStore.getState().addProfile(p2);
    expect(useProfileStore.getState().profiles).toEqual([p1, p2]);
  });

  it("setActiveProfileId sets activeProfileId in store", () => {
    useProfileStore.getState().setActiveProfileId("p1");
    expect(useProfileStore.getState().activeProfileId).toBe("p1");
  });

  it("setActiveProfileId(null) clears activeProfileId", () => {
    useProfileStore.setState({ activeProfileId: "p1" });
    useProfileStore.getState().setActiveProfileId(null);
    expect(useProfileStore.getState().activeProfileId).toBeNull();
  });

  // Story 4.4 — updateProfile and removeProfile
  it("updateProfile replaces the matching profile in the array", () => {
    const p1 = { id: "p1", name: "Work", activeMcps: ["mcp-a"], createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.setState({ profiles: [p1, p2] });
    const updated = { ...p1, name: "Work Updated", activeMcps: ["mcp-b"] };
    useProfileStore.getState().updateProfile(updated);
    const profiles = useProfileStore.getState().profiles;
    expect(profiles[0]).toEqual(updated);
    expect(profiles[1]).toEqual(p2);
  });

  it("updateProfile does not affect other profiles", () => {
    const p1 = { id: "p1", name: "Work", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.setState({ profiles: [p1, p2] });
    const updated = { ...p1, name: "Work Updated" };
    useProfileStore.getState().updateProfile(updated);
    expect(useProfileStore.getState().profiles[1]).toEqual(p2);
  });

  it("removeProfile removes the matching profile from the array", () => {
    const p1 = { id: "p1", name: "Work", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.setState({ profiles: [p1, p2] });
    useProfileStore.getState().removeProfile("p1");
    const profiles = useProfileStore.getState().profiles;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toEqual(p2);
  });

  it("removeProfile does not affect other profiles", () => {
    const p1 = { id: "p1", name: "Work", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", activeMcps: [], createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.setState({ profiles: [p1, p2] });
    useProfileStore.getState().removeProfile("p1");
    expect(useProfileStore.getState().profiles[0]).toEqual(p2);
  });
});
