import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Tauri invoke before importing stores
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { useSettingsStore } from "./useSettingsStore";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

describe("useSettingsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      codePath: null,
      desktopPath: null,
      isDetecting: false,
    });
  });

  it("has correct initial state", () => {
    const state = useSettingsStore.getState();
    expect(state.codePath).toBeNull();
    expect(state.desktopPath).toBeNull();
    expect(state.isDetecting).toBe(false);
  });

  it("setCodePath updates codePath", () => {
    const { setCodePath } = useSettingsStore.getState();
    setCodePath("/home/user/.claude/claude.json");
    expect(useSettingsStore.getState().codePath).toBe("/home/user/.claude/claude.json");
  });

  it("setDesktopPath updates desktopPath", () => {
    const { setDesktopPath } = useSettingsStore.getState();
    setDesktopPath("/home/user/Library/Application Support/Claude/claude_desktop_config.json");
    expect(useSettingsStore.getState().desktopPath).toBe(
      "/home/user/Library/Application Support/Claude/claude_desktop_config.json"
    );
  });

  it("detectPaths calls config_detect_paths and updates store", async () => {
    mockInvoke.mockResolvedValueOnce({
      codePath: "/home/.claude/claude.json",
      desktopPath: null,
    });

    const { detectPaths } = useSettingsStore.getState();
    await detectPaths();

    expect(mockInvoke).toHaveBeenCalledWith("config_rescan_paths", undefined);
    expect(useSettingsStore.getState().codePath).toBe("/home/.claude/claude.json");
    expect(useSettingsStore.getState().desktopPath).toBeNull();
    expect(useSettingsStore.getState().isDetecting).toBe(false);
  });

  it("detectPaths sets isDetecting to false on error", async () => {
    mockInvoke.mockRejectedValueOnce({ type: "WriteError", message: "failed" });

    const { detectPaths } = useSettingsStore.getState();
    await detectPaths();

    expect(useSettingsStore.getState().isDetecting).toBe(false);
  });

  it("loadSettings reads saved settings when they exist", async () => {
    mockInvoke.mockResolvedValueOnce({
      codePath: "/saved/claude.json",
      desktopPath: "/saved/claude_desktop_config.json",
    });

    const { loadSettings } = useSettingsStore.getState();
    await loadSettings();

    expect(useSettingsStore.getState().codePath).toBe("/saved/claude.json");
    expect(useSettingsStore.getState().desktopPath).toBe(
      "/saved/claude_desktop_config.json"
    );
  });

  it("loadSettings calls detectPaths when settings are empty", async () => {
    // First call: config_load_settings returns empty
    mockInvoke.mockResolvedValueOnce({ codePath: null, desktopPath: null });
    // Second call: config_rescan_paths returns detected paths
    mockInvoke.mockResolvedValueOnce({
      codePath: "/detected/.claude/claude.json",
      desktopPath: null,
    });

    const { loadSettings } = useSettingsStore.getState();
    await loadSettings();

    // Should have called rescan_paths as fallback
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(useSettingsStore.getState().codePath).toBe("/detected/.claude/claude.json");
    expect(useSettingsStore.getState().desktopPath).toBeNull();
  });
});
