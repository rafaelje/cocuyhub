import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: vi.fn() }));
vi.mock("@/stores/useSnapshotStore", () => ({
  useSnapshotStore: vi.fn(),
}));
vi.mock("@/stores/useAppStore", () => ({
  useAppStore: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/format-date", () => ({
  formatRelativeTime: vi.fn(() => "2 hours ago"),
  formatAbsoluteTime: vi.fn(() => "2026-02-26T14:00:00.000Z"),
  getDateGroup: vi.fn(() => "Today"),
}));

// Suppress ScrollArea ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { useSnapshotStore } from "@/stores/useSnapshotStore";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "sonner";
import { SnapshotsView } from "./SnapshotsView";
import type { ClaudeConfig, Snapshot } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);
const mockSetupListener = vi.fn().mockResolvedValue(() => {});
const mockFetchSnapshots = vi.fn().mockResolvedValue(undefined);
const mockSetSnapshotFormOpen = vi.fn();
const mockReloadConfig = vi.fn().mockResolvedValue(undefined);

const mockConfig: ClaudeConfig = { mcpServers: {} };

const makeSnapshot = (id: string, tool: "code" | "desktop"): Snapshot => ({
  id,
  name: `snap-${id}`,
  timestamp: "1706308200000",
  tool,
  content: "{}",
  isAuto: false,
});

describe("SnapshotsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConfigStore).mockImplementation((selector) =>
      selector({ codeConfig: mockConfig, desktopConfig: mockConfig } as never)
    );
    vi.mocked(useConfigStore).getState = vi.fn().mockReturnValue({
      reloadConfig: mockReloadConfig,
    });
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({ snapshots: [], isLoading: false } as never)
    );
    vi.mocked(useSnapshotStore).getState = vi.fn().mockReturnValue({
      setupListener: mockSetupListener,
      fetchSnapshots: mockFetchSnapshots,
    });
    vi.mocked(useAppStore).mockImplementation((selector) =>
      selector({
        snapshotFormOpen: false,
        setSnapshotFormOpen: mockSetSnapshotFormOpen,
      } as never)
    );
    mockSetupListener.mockResolvedValue(() => {});
  });

  it("renders Create Snapshot button", () => {
    render(<SnapshotsView />);
    expect(
      screen.getByRole("button", { name: "Create Snapshot" })
    ).not.toBeNull();
  });

  it("clicking Create Snapshot button calls setSnapshotFormOpen(true)", async () => {
    render(<SnapshotsView />);
    await userEvent.click(
      screen.getByRole("button", { name: "Create Snapshot" })
    );
    expect(mockSetSnapshotFormOpen).toHaveBeenCalledWith(true);
  });

  it("setupListener is called on mount", () => {
    render(<SnapshotsView />);
    expect(mockSetupListener).toHaveBeenCalled();
  });

  it("calls fetchSnapshots on mount", () => {
    render(<SnapshotsView />);
    expect(mockFetchSnapshots).toHaveBeenCalled();
  });

  it("opens the form dialog when snapshotFormOpen is true", () => {
    vi.mocked(useAppStore).mockImplementation((selector) =>
      selector({
        snapshotFormOpen: true,
        setSnapshotFormOpen: mockSetSnapshotFormOpen,
      } as never)
    );
    render(<SnapshotsView />);
    expect(
      screen.getByPlaceholderText('e.g. "Before adding GitHub MCP"')
    ).not.toBeNull();
  });

  it("calls invokeCommand with snapshot_create on successful form submit", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    vi.mocked(useAppStore).mockImplementation((selector) =>
      selector({
        snapshotFormOpen: true,
        setSnapshotFormOpen: mockSetSnapshotFormOpen,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.type(
      screen.getByPlaceholderText('e.g. "Before adding GitHub MCP"'),
      "my snapshot"
    );
    await userEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create Snapshot" })
    );
    expect(mockInvokeCommand).toHaveBeenCalledWith("snapshot_create", {
      name: "my snapshot",
      tool: "code",
      isAuto: false,
      content: JSON.stringify(mockConfig, null, 2),
    });
  });

  it("calls toast.success with snapshot name on successful create", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    vi.mocked(useAppStore).mockImplementation((selector) =>
      selector({
        snapshotFormOpen: true,
        setSnapshotFormOpen: mockSetSnapshotFormOpen,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.type(
      screen.getByPlaceholderText('e.g. "Before adding GitHub MCP"'),
      "release candidate"
    );
    await userEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create Snapshot" })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Snapshot created: release candidate",
      { duration: 3000 }
    );
  });

  it("calls toast.error on create failure", async () => {
    mockInvokeCommand.mockRejectedValue({ message: "disk full" });
    vi.mocked(useAppStore).mockImplementation((selector) =>
      selector({
        snapshotFormOpen: true,
        setSnapshotFormOpen: mockSetSnapshotFormOpen,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create Snapshot" })
    );
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to create snapshot: disk full",
      { duration: Infinity }
    );
  });

  it("calls invokeCommand twice when Both is selected", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    vi.mocked(useAppStore).mockImplementation((selector) =>
      selector({
        snapshotFormOpen: true,
        setSnapshotFormOpen: mockSetSnapshotFormOpen,
      } as never)
    );
    render(<SnapshotsView />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create Snapshot" })
    );
    expect(mockInvokeCommand).toHaveBeenCalledTimes(2);
    expect(mockInvokeCommand).toHaveBeenCalledWith(
      "snapshot_create",
      expect.objectContaining({ tool: "code" })
    );
    expect(mockInvokeCommand).toHaveBeenCalledWith(
      "snapshot_create",
      expect.objectContaining({ tool: "desktop" })
    );
  });

  it("skips tool and shows toast.error when config is null for that tool", async () => {
    vi.mocked(useConfigStore).mockImplementation((selector) =>
      selector({ codeConfig: null, desktopConfig: mockConfig } as never)
    );
    vi.mocked(useAppStore).mockImplementation((selector) =>
      selector({
        snapshotFormOpen: true,
        setSnapshotFormOpen: mockSetSnapshotFormOpen,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create Snapshot" })
    );
    expect(mockInvokeCommand).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "Cannot create snapshot: Claude Code config not loaded",
      { duration: Infinity }
    );
  });

  it("renders SnapshotList when snapshots are loaded", () => {
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code"), makeSnapshot("2", "desktop")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    expect(screen.getByText("snap-1")).not.toBeNull();
    expect(screen.getByText("snap-2")).not.toBeNull();
  });

  it("renders empty state when snapshots is empty", () => {
    render(<SnapshotsView />);
    expect(
      screen.getByText(
        "No snapshots yet. Snapshots are created automatically before each change."
      )
    ).not.toBeNull();
  });

  it("filter tabs have aria-pressed reflecting selected state", async () => {
    render(<SnapshotsView />);
    const allBtn = screen.getByRole("button", { name: "All" });
    const codeBtn = screen.getByRole("button", { name: "Code" });
    expect(allBtn.getAttribute("aria-pressed")).toBe("true");
    expect(codeBtn.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(codeBtn);
    expect(allBtn.getAttribute("aria-pressed")).toBe("false");
    expect(codeBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("filter tab 'Code' filters to code snapshots only", async () => {
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code"), makeSnapshot("2", "desktop")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(screen.getByRole("button", { name: "Code" }));
    expect(screen.getByText("snap-1")).not.toBeNull();
    expect(screen.queryByText("snap-2")).toBeNull();
  });

  it("filter tab 'Desktop' filters to desktop snapshots only", async () => {
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code"), makeSnapshot("2", "desktop")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(screen.getByRole("button", { name: "Desktop" }));
    expect(screen.queryByText("snap-1")).toBeNull();
    expect(screen.getByText("snap-2")).not.toBeNull();
  });

  it("filter tab 'All' shows all snapshots", async () => {
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code"), makeSnapshot("2", "desktop")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(screen.getByRole("button", { name: "Code" }));
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("snap-1")).not.toBeNull();
    expect(screen.getByText("snap-2")).not.toBeNull();
  });

  it("clicking Restore on a snapshot opens the confirmation dialog", async () => {
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(
      screen.getByRole("button", { name: "Restore snapshot from 2 hours ago" })
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("confirming restore calls invokeCommand with snapshot_restore", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(
      screen.getByRole("button", { name: "Restore snapshot from 2 hours ago" })
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("snapshot_restore", {
      snapshotId: "1",
      tool: "code",
    });
  });

  it("successful restore calls toast.success with 'Restored: {name}'", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(
      screen.getByRole("button", { name: "Restore snapshot from 2 hours ago" })
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(mockToastSuccess).toHaveBeenCalledWith("Restored: snap-1", { duration: 3000 });
  });

  it("failed restore calls toast.error with specific message", async () => {
    mockInvokeCommand.mockRejectedValue({ message: "file locked" });
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(
      screen.getByRole("button", { name: "Restore snapshot from 2 hours ago" })
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(mockToastError).toHaveBeenCalledWith("Failed to restore: file locked", {
      duration: Infinity,
    });
  });

  it("successful restore calls reloadConfig on useConfigStore", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    vi.mocked(useSnapshotStore).mockImplementation((selector) =>
      selector({
        snapshots: [makeSnapshot("1", "code")],
        isLoading: false,
      } as never)
    );
    render(<SnapshotsView />);
    await userEvent.click(
      screen.getByRole("button", { name: "Restore snapshot from 2 hours ago" })
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });
});
