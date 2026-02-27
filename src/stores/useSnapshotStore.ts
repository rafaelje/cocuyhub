import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invokeCommand } from "@/lib/ipc";
import type { Snapshot, ToolTarget } from "@/types";

interface SnapshotCreatedEvent {
  tool: ToolTarget;
  snapshotId: string;
}

interface SnapshotState {
  snapshots: Snapshot[];
  isLoading: boolean;
  fetchSnapshots: (tool?: ToolTarget) => Promise<void>;
  addSnapshot: (snapshot: Snapshot) => void;
  setupListener: () => Promise<() => void>;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: [],
  isLoading: false,

  fetchSnapshots: async (tool?: ToolTarget) => {
    set((state) => ({ ...state, isLoading: true }));
    try {
      const snapshots = await invokeCommand<Snapshot[]>("snapshot_list", {
        tool: tool ?? null,
      });
      set((state) => ({ ...state, snapshots, isLoading: false }));
    } catch {
      set((state) => ({ ...state, isLoading: false }));
    }
  },

  addSnapshot: (snapshot: Snapshot) =>
    set((state) => ({ ...state, snapshots: [snapshot, ...state.snapshots] })),

  setupListener: async () => {
    const unlisten = await listen<SnapshotCreatedEvent>(
      "snapshot://created",
      async (event) => {
        await get().fetchSnapshots(event.payload.tool);
      }
    );
    return unlisten;
  },
}));
