import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invokeCommand } from "@/lib/ipc";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import type { ClaudeConfig, CommandError, ToolTarget } from "@/types";

interface ExternalChangeEvent {
  path: string;
  tool: ToolTarget;
}

interface ConfigState {
  codeConfig: ClaudeConfig | null;
  desktopConfig: ClaudeConfig | null;
  codeRaw: string | null;
  desktopRaw: string | null;
  codeError: CommandError | null;
  desktopError: CommandError | null;
  isLoading: boolean;
  loadConfigs: () => Promise<void>;
  reloadConfig: (tool: ToolTarget) => Promise<void>;
  setupFileWatcher: () => Promise<() => void>;
}

async function readAndParseConfig(
  path: string
): Promise<{ raw: string; config: ClaudeConfig | null; error: CommandError | null }> {
  try {
    const raw = await invokeCommand<string>("config_read_file", { path });
    let config: ClaudeConfig | null = null;
    let error: CommandError | null = null;
    try {
      config = JSON.parse(raw) as ClaudeConfig;
    } catch (e) {
      error = {
        type: "ParseError",
        message: e instanceof Error ? e.message : "JSON parse failed",
      };
    }
    return { raw, config, error };
  } catch (err) {
    const cmdError = err as CommandError;
    return { raw: null as unknown as string, config: null, error: cmdError };
  }
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  codeConfig: null,
  desktopConfig: null,
  codeRaw: null,
  desktopRaw: null,
  codeError: null,
  desktopError: null,
  isLoading: false,

  loadConfigs: async () => {
    set((state) => ({ ...state, isLoading: true }));
    const { codePath, desktopPath } = useSettingsStore.getState();

    const results = await Promise.allSettled([
      codePath ? readAndParseConfig(codePath) : Promise.resolve(null),
      desktopPath ? readAndParseConfig(desktopPath) : Promise.resolve(null),
    ]);

    const codeResult = results[0].status === "fulfilled" ? results[0].value : null;
    const desktopResult = results[1].status === "fulfilled" ? results[1].value : null;

    set((state) => ({
      ...state,
      isLoading: false,
      codeConfig: codeResult?.config ?? null,
      codeRaw: codeResult?.raw ?? null,
      codeError: codeResult?.error ?? null,
      desktopConfig: desktopResult?.config ?? null,
      desktopRaw: desktopResult?.raw ?? null,
      desktopError: desktopResult?.error ?? null,
    }));
  },

  reloadConfig: async (tool: ToolTarget) => {
    const { codePath, desktopPath } = useSettingsStore.getState();
    const path = tool === "code" ? codePath : desktopPath;

    if (!path) return;

    const result = await readAndParseConfig(path);

    if (tool === "code") {
      set((state) => ({
        ...state,
        codeConfig: result.config,
        codeRaw: result.raw,
        codeError: result.error,
      }));
    } else {
      set((state) => ({
        ...state,
        desktopConfig: result.config,
        desktopRaw: result.raw,
        desktopError: result.error,
      }));
    }
  },

  setupFileWatcher: async () => {
    const { codePath, desktopPath } = useSettingsStore.getState();
    const paths = [codePath, desktopPath].filter(Boolean) as string[];

    if (paths.length > 0) {
      try {
        await invokeCommand("config_start_watcher", { paths });
      } catch {
        // Non-fatal: watcher setup failure just means no live updates
      }
    }

    const unlisten = await listen<ExternalChangeEvent>(
      "config://external-change",
      async (event) => {
        const { tool } = event.payload;
        const { editorDirty } = useAppStore.getState();

        if (editorDirty) {
          useAppStore.getState().setExternalChangeWarning(true);
        } else {
          await get().reloadConfig(tool);
        }
      }
    );

    return unlisten;
  },
}));
