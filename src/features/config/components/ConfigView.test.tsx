import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Tauri APIs (transitively imported by useConfigStore)
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock react-router-dom — SmartPasteBanner uses useNavigate
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

// Mock useConfigStore so we control state
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: vi.fn(),
}));

// Mock @/lib/ipc — SmartPasteBanner uses invokeCommand
vi.mock("@/lib/ipc", () => ({
  invokeCommand: vi.fn(),
}));

// Mock sonner — SmartPasteBanner uses toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useConfigStore } from "@/stores/useConfigStore";
import { useAppStore } from "@/stores/useAppStore";
import { ConfigView } from "./ConfigView";
import type { ClaudeConfig, CommandError } from "@/types";

const mockUseConfigStore = vi.mocked(useConfigStore);

const codeConfig: ClaudeConfig = {
  mcpServers: { "code-mcp": { command: "node", args: [] } },
};
const desktopConfig: ClaudeConfig = {
  mcpServers: { "desktop-mcp": { command: "python", args: [] } },
};

function defaultState(overrides: Partial<ReturnType<typeof useConfigStore>> = {}) {
  return {
    codeConfig: null,
    desktopConfig: null,
    codeRaw: null,
    desktopRaw: null,
    codeError: null,
    desktopError: null,
    isLoading: false,
    loadConfigs: vi.fn(),
    reloadConfig: vi.fn(),
    setupFileWatcher: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useConfigStore>;
}

describe("ConfigView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConfigStore.mockReturnValue(defaultState());
    // Reset app store to a clean default state (real Zustand store)
    useAppStore.setState({
      processStatus: { code: false, desktop: false },
      configActiveTool: "code",
      editorDirty: false,
      externalChangeWarning: false,
    });
  });

  it("renders Claude Code and Claude Desktop tabs", () => {
    render(<ConfigView />);
    expect(screen.getByRole("tab", { name: "Claude Code" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Claude Desktop" })).not.toBeNull();
  });

  // M2: TabsList has aria-label
  it("tab list has aria-label for screen readers", () => {
    render(<ConfigView />);
    expect(
      screen.getByRole("tablist", { name: "Claude tool selector" })
    ).not.toBeNull();
  });

  it("shows code empty state when codeConfig is null (default tab)", () => {
    render(<ConfigView />);
    expect(
      screen.getByText("No MCPs configured. Paste a config to add one.")
    ).not.toBeNull();
  });

  it("shows code MCPs in the code tab", () => {
    mockUseConfigStore.mockReturnValue(defaultState({ codeConfig }));
    render(<ConfigView />);
    expect(screen.getByText("code-mcp")).not.toBeNull();
  });

  it("switching to Desktop tab shows desktop MCPs", async () => {
    mockUseConfigStore.mockReturnValue(defaultState({ codeConfig, desktopConfig }));
    render(<ConfigView />);

    const desktopTab = screen.getByRole("tab", { name: "Claude Desktop" });
    await userEvent.click(desktopTab);

    expect(screen.getByText("desktop-mcp")).not.toBeNull();
  });

  it("switching to Desktop tab hides code MCPs", async () => {
    mockUseConfigStore.mockReturnValue(defaultState({ codeConfig, desktopConfig }));
    render(<ConfigView />);

    const desktopTab = screen.getByRole("tab", { name: "Claude Desktop" });
    await userEvent.click(desktopTab);

    // Code MCP unmounted after tab switch (Radix unmounts inactive tab content)
    expect(screen.queryByText("code-mcp")).toBeNull();
  });

  // M3: loading state
  it("shows loading skeleton when isLoading is true", () => {
    mockUseConfigStore.mockReturnValue(defaultState({ isLoading: true }));
    const { container } = render(<ConfigView />);
    expect(container.querySelectorAll(".animate-pulse").length).toBe(3);
  });

  it("does not show empty state while loading", () => {
    mockUseConfigStore.mockReturnValue(defaultState({ isLoading: true }));
    render(<ConfigView />);
    expect(
      screen.queryByText("No MCPs configured. Paste a config to add one.")
    ).toBeNull();
  });

  // M1: error state
  it("shows error message when codeError is set (default code tab)", () => {
    const err: CommandError = { type: "FileNotFound", path: "/missing/claude.json" };
    mockUseConfigStore.mockReturnValue(defaultState({ codeError: err }));
    render(<ConfigView />);
    expect(
      screen.getByText("Could not read config file. Check the path in Settings.")
    ).not.toBeNull();
  });

  it("does not show empty state when codeError is set", () => {
    const err: CommandError = { type: "ReadError", message: "permission denied" };
    mockUseConfigStore.mockReturnValue(defaultState({ codeError: err }));
    render(<ConfigView />);
    expect(
      screen.queryByText("No MCPs configured. Paste a config to add one.")
    ).toBeNull();
  });

  // M3 review fix: ProcessWarningBanner integration
  it("shows process warning banner when code process is active (default code tab)", () => {
    useAppStore.setState({ processStatus: { code: true, desktop: false } });
    render(<ConfigView />);
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen.getByText("Claude Code is running — changes will apply on next launch")
    ).not.toBeNull();
  });

  it("does not show process warning banner when no process is active", () => {
    useAppStore.setState({ processStatus: { code: false, desktop: false } });
    render(<ConfigView />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Per-MCP copy-to-other button visibility
  it("does not show per-MCP copy-to-other button when only one config is loaded", () => {
    mockUseConfigStore.mockReturnValue(defaultState({ codeConfig }));
    render(<ConfigView />);
    expect(
      screen.queryByRole("button", { name: "Copy code-mcp to Claude Desktop" })
    ).toBeNull();
  });

  it("shows per-MCP copy-to-other button when both configs are loaded", () => {
    mockUseConfigStore.mockReturnValue(defaultState({ codeConfig, desktopConfig }));
    render(<ConfigView />);
    expect(
      screen.getByRole("button", { name: "Copy code-mcp to Claude Desktop" })
    ).not.toBeNull();
  });
});
