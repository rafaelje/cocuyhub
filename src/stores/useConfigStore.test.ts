import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Tauri APIs before importing stores
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { useConfigStore } from "./useConfigStore";
import { useSettingsStore } from "./useSettingsStore";
import { useAppStore } from "./useAppStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const mockInvoke = vi.mocked(invoke);

describe("useConfigStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigStore.setState({
      codeConfig: null,
      desktopConfig: null,
      codeRaw: null,
      desktopRaw: null,
      codeError: null,
      desktopError: null,
      isLoading: false,
    });
    useSettingsStore.setState({
      codePath: null,
      desktopPath: null,
      isDetecting: false,
    });
    useAppStore.setState({
      sidebarCollapsed: false,
      isLoading: false,
      error: null,
      processStatus: { code: false, desktop: false },
      editorDirty: false,
      externalChangeWarning: false,
    });
  });

  it("has correct initial state", () => {
    const state = useConfigStore.getState();
    expect(state.codeConfig).toBeNull();
    expect(state.desktopConfig).toBeNull();
    expect(state.codeRaw).toBeNull();
    expect(state.desktopRaw).toBeNull();
    expect(state.codeError).toBeNull();
    expect(state.desktopError).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("loadConfigs does nothing when no paths are set", async () => {
    const { loadConfigs } = useConfigStore.getState();
    await loadConfigs();

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(useConfigStore.getState().isLoading).toBe(false);
  });

  it("loadConfigs reads code config when codePath is set", async () => {
    useSettingsStore.setState((s) => ({ ...s, codePath: "/path/claude.json" }));

    const mockRaw = JSON.stringify({ mcpServers: { "test-mcp": { command: "node", args: [] } } });
    mockInvoke.mockResolvedValueOnce(mockRaw);

    const { loadConfigs } = useConfigStore.getState();
    await loadConfigs();

    expect(mockInvoke).toHaveBeenCalledWith("config_read_file", { path: "/path/claude.json" });
    const state = useConfigStore.getState();
    expect(state.codeRaw).toBe(mockRaw);
    expect(state.codeConfig).not.toBeNull();
    expect(state.codeError).toBeNull();
  });

  it("loadConfigs sets codeError when config_read_file throws FileNotFound", async () => {
    useSettingsStore.setState((s) => ({
      ...s,
      codePath: "/missing/claude.json",
    }));

    mockInvoke.mockRejectedValueOnce({ type: "FileNotFound", path: "/missing/claude.json" });

    const { loadConfigs } = useConfigStore.getState();
    await loadConfigs();

    const state = useConfigStore.getState();
    expect(state.codeError).toEqual({ type: "FileNotFound", path: "/missing/claude.json" });
    expect(state.codeConfig).toBeNull();
  });

  it("reloadConfig updates only the specified tool", async () => {
    useSettingsStore.setState((s) => ({
      ...s,
      codePath: "/path/claude.json",
      desktopPath: "/path/claude_desktop.json",
    }));

    // Set initial state with both configs
    useConfigStore.setState((s) => ({
      ...s,
      desktopRaw: '{"mcpServers":{}}',
      desktopConfig: { mcpServers: {} },
    }));

    const newRaw = JSON.stringify({ mcpServers: { updated: { command: "node", args: [] } } });
    mockInvoke.mockResolvedValueOnce(newRaw);

    const { reloadConfig } = useConfigStore.getState();
    await reloadConfig("code");

    const state = useConfigStore.getState();
    expect(state.codeRaw).toBe(newRaw);
    // Desktop config should be unchanged
    expect(state.desktopRaw).toBe('{"mcpServers":{}}');
  });

  it("loadConfigs sets isLoading correctly", async () => {
    useSettingsStore.setState((s) => ({ ...s, codePath: "/path/claude.json" }));
    mockInvoke.mockResolvedValueOnce('{"mcpServers":{}}');

    let wasLoading = false;
    const unsub = useConfigStore.subscribe((state) => {
      if (state.isLoading) wasLoading = true;
    });

    await useConfigStore.getState().loadConfigs();
    unsub();

    expect(wasLoading).toBe(true);
    expect(useConfigStore.getState().isLoading).toBe(false);
  });

  it("setupFileWatcher sets externalChangeWarning when editorDirty is true", async () => {
    // Use a wrapper object to avoid TypeScript control-flow narrowing to `never`
    const captured = { cb: null as ((e: { payload: { tool: string; path: string } }) => void) | null };

    vi.mocked(listen).mockImplementationOnce((_event, cb) => {
      captured.cb = cb as typeof captured.cb;
      return Promise.resolve(() => {});
    });

    useAppStore.setState((s) => ({ ...s, editorDirty: true }));

    await useConfigStore.getState().setupFileWatcher();

    captured.cb?.({ payload: { tool: "code", path: "/some/claude.json" } });

    expect(useAppStore.getState().externalChangeWarning).toBe(true);
  });

  it("setupFileWatcher reloads config silently when editorDirty is false", async () => {
    const captured = { cb: null as ((e: { payload: { tool: string; path: string } }) => void) | null };

    vi.mocked(listen).mockImplementationOnce((_event, cb) => {
      captured.cb = cb as typeof captured.cb;
      return Promise.resolve(() => {});
    });

    useSettingsStore.setState((s) => ({ ...s, codePath: "/path/claude.json" }));
    mockInvoke.mockResolvedValue('{"mcpServers":{}}');

    useAppStore.setState((s) => ({ ...s, editorDirty: false }));

    await useConfigStore.getState().setupFileWatcher();

    captured.cb?.({ payload: { tool: "code", path: "/path/claude.json" } });

    // Flush async microtasks
    await new Promise((r) => setTimeout(r, 0));

    expect(useAppStore.getState().externalChangeWarning).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith("config_read_file", { path: "/path/claude.json" });
  });

  it("setupFileWatcher returns an unlisten cleanup function", async () => {
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);

    const unlisten = await useConfigStore.getState().setupFileWatcher();
    unlisten();

    expect(mockUnlisten).toHaveBeenCalledOnce();
  });
});
