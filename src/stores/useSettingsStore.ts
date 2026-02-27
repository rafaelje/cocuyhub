import { create } from "zustand";
import { invokeCommand } from "@/lib/ipc";
import type { AppSettings, DetectedPaths } from "@/types";

interface SettingsState {
  codePath: string | null;
  desktopPath: string | null;
  isDetecting: boolean;
  detectPaths: () => Promise<void>;
  setCodePath: (path: string | null) => void;
  setDesktopPath: (path: string | null) => void;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  codePath: null,
  desktopPath: null,
  isDetecting: false,

  detectPaths: async () => {
    set((state) => ({ ...state, isDetecting: true }));
    try {
      const result = await invokeCommand<DetectedPaths>("config_rescan_paths");
      set((state) => ({
        ...state,
        codePath: result.codePath ?? null,
        desktopPath: result.desktopPath ?? null,
        isDetecting: false,
      }));
    } catch {
      set((state) => ({ ...state, isDetecting: false }));
    }
  },

  setCodePath: (path: string | null) => {
    set((state) => ({ ...state, codePath: path }));
  },

  setDesktopPath: (path: string | null) => {
    set((state) => ({ ...state, desktopPath: path }));
  },

  loadSettings: async () => {
    try {
      const settings = await invokeCommand<AppSettings>("config_load_settings");
      if (settings.codePath !== null || settings.desktopPath !== null) {
        set((state) => ({
          ...state,
          codePath: settings.codePath ?? null,
          desktopPath: settings.desktopPath ?? null,
        }));
      } else {
        // No settings saved yet - run auto-detection
        await get().detectPaths();
      }
    } catch {
      // On error, try detection
      await get().detectPaths();
    }
  },
}));
