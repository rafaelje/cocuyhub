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

const emptyMcpServers = () => ({ code: {}, desktop: {} });

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
    expect(useProfileStore.getState().computeMixedState("code")).toBe(false);
  });

  it("computeMixedState returns false when config is null", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          mcpServers: emptyMcpServers(),
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({ codeConfig: null });
    expect(useProfileStore.getState().computeMixedState("code")).toBe(false);
  });

  it("computeMixedState returns false when mcpServers exactly match config", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          mcpServers: {
            code: {
              "mcp-a": { command: "node", args: [] },
              "mcp-b": { command: "node", args: [] },
            },
            desktop: {},
          },
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

  it("computeMixedState returns true when current config has more MCPs than profile snapshot", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          mcpServers: {
            code: {
              "mcp-a": { command: "node", args: [] },
              "mcp-b": { command: "node", args: [] },
            },
            desktop: {},
          },
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
          "mcp-c": { command: "node", args: [] }, // extra MCP not in snapshot
        },
      },
    });
    expect(useProfileStore.getState().computeMixedState("code")).toBe(true);
  });

  it("computeMixedState returns true when current config has fewer MCPs than profile snapshot", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          mcpServers: {
            code: {
              "mcp-a": { command: "node", args: [] },
              "mcp-b": { command: "node", args: [] },
              "mcp-c": { command: "node", args: [] },
            },
            desktop: {},
          },
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
    expect(useProfileStore.getState().computeMixedState("code")).toBe(true);
  });

  it("computeMixedState returns true when MCP disabled state differs", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          mcpServers: {
            code: {
              "mcp-a": { command: "node", args: [], disabled: true },
            },
            desktop: {},
          },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({
      codeConfig: {
        mcpServers: {
          "mcp-a": { command: "node", args: [] }, // enabled in config, disabled in snapshot
        },
      },
    });
    expect(useProfileStore.getState().computeMixedState("code")).toBe(true);
  });

  it("computeMixedState returns true when MCP command differs", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Dev",
          mcpServers: {
            code: {
              "mcp-a": { command: "node", args: [] },
            },
            desktop: {},
          },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      activeProfileId: "p1",
    });
    mockConfigGetState.mockReturnValue({
      codeConfig: {
        mcpServers: {
          "mcp-a": { command: "python", args: [] }, // different command
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
          mcpServers: {
            code: {},
            desktop: {
              "mcp-a": { command: "node", args: [] },
            },
          },
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

  it("computeMixedState handles empty mcpServers and empty config correctly", () => {
    useProfileStore.setState({
      profiles: [
        {
          id: "p1",
          name: "Empty",
          mcpServers: emptyMcpServers(),
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

  it("initializes with isLoading false", () => {
    expect(useProfileStore.getState().isLoading).toBe(false);
  });

  it("fetchProfiles sets profiles from invokeCommand result", async () => {
    const mockProfiles = [
      {
        id: "p1",
        name: "Work",
        mcpServers: emptyMcpServers(),
        createdAt: "2026-01-01T00:00:00Z",
      },
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
    const profile = {
      id: "p1",
      name: "Work",
      mcpServers: emptyMcpServers(),
      createdAt: "2026-01-01T00:00:00Z",
    };
    useProfileStore.getState().addProfile(profile);
    expect(useProfileStore.getState().profiles).toEqual([profile]);
  });

  it("addProfile preserves existing profiles", () => {
    const p1 = { id: "p1", name: "Work", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
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

  it("updateProfile replaces the matching profile in the array", () => {
    const p1 = {
      id: "p1",
      name: "Work",
      mcpServers: { code: { "mcp-a": { command: "node", args: [] } }, desktop: {} },
      createdAt: "2026-01-01T00:00:00Z",
    };
    const p2 = { id: "p2", name: "Research", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.setState({ profiles: [p1, p2] });
    const updated = {
      ...p1,
      name: "Work Updated",
      mcpServers: { code: { "mcp-b": { command: "node", args: [] } }, desktop: {} },
    };
    useProfileStore.getState().updateProfile(updated);
    const profiles = useProfileStore.getState().profiles;
    expect(profiles[0]).toEqual(updated);
    expect(profiles[1]).toEqual(p2);
  });

  it("updateProfile does not affect other profiles", () => {
    const p1 = { id: "p1", name: "Work", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.setState({ profiles: [p1, p2] });
    const updated = { ...p1, name: "Work Updated" };
    useProfileStore.getState().updateProfile(updated);
    expect(useProfileStore.getState().profiles[1]).toEqual(p2);
  });

  it("removeProfile removes the matching profile from the array", () => {
    const p1 = { id: "p1", name: "Work", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.setState({ profiles: [p1, p2] });
    useProfileStore.getState().removeProfile("p1");
    const profiles = useProfileStore.getState().profiles;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toEqual(p2);
  });

  it("removeProfile does not affect other profiles", () => {
    const p1 = { id: "p1", name: "Work", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
    const p2 = { id: "p2", name: "Research", mcpServers: emptyMcpServers(), createdAt: "2026-01-01T00:00:00Z" };
    useProfileStore.setState({ profiles: [p1, p2] });
    useProfileStore.getState().removeProfile("p1");
    expect(useProfileStore.getState().profiles[0]).toEqual(p2);
  });
});
