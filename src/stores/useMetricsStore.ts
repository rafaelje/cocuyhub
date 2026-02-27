import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invokeCommand } from "@/lib/ipc";
import type { MetricsPayload } from "@/types";

interface MetricsState {
  payload: MetricsPayload | null;
  isLoading: boolean;
  fetchMetrics: () => Promise<void>;
  startWatcher: () => Promise<void>;
  setupListener: () => Promise<() => void>;
}

export const useMetricsStore = create<MetricsState>((set, get) => ({
  payload: null,
  isLoading: false,

  fetchMetrics: async () => {
    set((state) => ({ ...state, isLoading: true }));
    try {
      const payload = await invokeCommand<MetricsPayload>("metrics_read");
      set((state) => ({ ...state, payload, isLoading: false }));
    } catch {
      set((state) => ({ ...state, isLoading: false }));
    }
  },

  startWatcher: async () => {
    await invokeCommand("metrics_start_watcher");
  },

  setupListener: async () => {
    const unlisten = await listen("metrics://updated", async () => {
      await get().fetchMetrics();
    });
    return unlisten;
  },
}));
