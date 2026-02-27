import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({
  invokeCommand: vi.fn(),
}));

import { listen } from "@tauri-apps/api/event";
import { invokeCommand } from "@/lib/ipc";
import { useSnapshotStore } from "./useSnapshotStore";
import type { Snapshot } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockListen = vi.mocked(listen);

const mockSnapshot: Snapshot = {
  id: "snap-1",
  name: "auto",
  timestamp: "1700000000000",
  tool: "code",
  content: '{"mcpServers":{}}',
  isAuto: true,
};

describe("useSnapshotStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useSnapshotStore.setState({ snapshots: [], isLoading: false });
  });

  it("initializes with empty snapshots and isLoading false", () => {
    const state = useSnapshotStore.getState();
    expect(state.snapshots).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it("fetchSnapshots sets isLoading to true then false", async () => {
    mockInvokeCommand.mockResolvedValue([]);
    await useSnapshotStore.getState().fetchSnapshots();
    expect(useSnapshotStore.getState().isLoading).toBe(false);
  });

  it("fetchSnapshots calls invokeCommand with snapshot_list", async () => {
    mockInvokeCommand.mockResolvedValue([]);
    await useSnapshotStore.getState().fetchSnapshots();
    expect(mockInvokeCommand).toHaveBeenCalledWith("snapshot_list", { tool: null });
  });

  it("fetchSnapshots with tool passes tool to invokeCommand", async () => {
    mockInvokeCommand.mockResolvedValue([]);
    await useSnapshotStore.getState().fetchSnapshots("code");
    expect(mockInvokeCommand).toHaveBeenCalledWith("snapshot_list", { tool: "code" });
  });

  it("fetchSnapshots updates snapshots from result", async () => {
    mockInvokeCommand.mockResolvedValue([mockSnapshot]);
    await useSnapshotStore.getState().fetchSnapshots();
    expect(useSnapshotStore.getState().snapshots).toEqual([mockSnapshot]);
  });

  it("fetchSnapshots resets isLoading on error", async () => {
    mockInvokeCommand.mockRejectedValue(new Error("network error"));
    await useSnapshotStore.getState().fetchSnapshots();
    expect(useSnapshotStore.getState().isLoading).toBe(false);
  });

  it("addSnapshot prepends to snapshots list", () => {
    const existing: Snapshot = { ...mockSnapshot, id: "snap-0" };
    useSnapshotStore.setState({ snapshots: [existing] });

    const newSnap: Snapshot = { ...mockSnapshot, id: "snap-new" };
    useSnapshotStore.getState().addSnapshot(newSnap);

    const snapshots = useSnapshotStore.getState().snapshots;
    expect(snapshots[0].id).toBe("snap-new");
    expect(snapshots[1].id).toBe("snap-0");
  });

  it("setupListener calls listen with snapshot://created event", async () => {
    await useSnapshotStore.getState().setupListener();
    expect(mockListen).toHaveBeenCalledWith("snapshot://created", expect.any(Function));
  });

  it("setupListener returns an unlisten function", async () => {
    const unlisten = await useSnapshotStore.getState().setupListener();
    expect(typeof unlisten).toBe("function");
  });
});
