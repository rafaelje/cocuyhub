import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestoreConfirmDialog } from "./RestoreConfirmDialog";
import type { Snapshot } from "@/types";

// Pure presentational + async interaction — no Tauri mocks needed
vi.mock("@/lib/format-date", () => ({
  formatRelativeTime: vi.fn(() => "2 hours ago"),
  formatAbsoluteTime: vi.fn(() => "2026-02-26T14:00:00.000Z"),
}));

const mockSnapshot: Snapshot = {
  id: "snap-1",
  name: "before refactor",
  timestamp: "1706308200000",
  tool: "code",
  content: "{}",
  isAuto: false,
};

describe("RestoreConfirmDialog", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConfirm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders dialog with snapshot name, relative time, and tool", () => {
    render(
      <RestoreConfirmDialog
        snapshot={mockSnapshot}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );
    expect(screen.getByText("before refactor")).not.toBeNull();
    expect(screen.getByText("2 hours ago")).not.toBeNull();
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
  });

  it("renders 'auto' as name for empty-name snapshot", () => {
    const autoSnapshot: Snapshot = { ...mockSnapshot, name: "" };
    render(
      <RestoreConfirmDialog
        snapshot={autoSnapshot}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );
    expect(screen.getByText("auto")).not.toBeNull();
  });

  it("shows warning text with tool label", () => {
    render(
      <RestoreConfirmDialog
        snapshot={mockSnapshot}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );
    expect(
      screen.getByText(/This will overwrite your current Claude Code configuration/)
    ).not.toBeNull();
  });

  it("Cancel calls onOpenChange(false) without calling onConfirm", async () => {
    render(
      <RestoreConfirmDialog
        snapshot={mockSnapshot}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it("Restore button calls onConfirm", async () => {
    render(
      <RestoreConfirmDialog
        snapshot={mockSnapshot}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it("Restore button shows 'Restoring...' and is disabled while onConfirm is pending", async () => {
    let resolveConfirm!: () => void;
    const pendingConfirm = vi.fn(
      () => new Promise<void>((resolve) => { resolveConfirm = resolve; })
    );

    render(
      <RestoreConfirmDialog
        snapshot={mockSnapshot}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={pendingConfirm}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.getByRole("button", { name: "Restoring..." })).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Restoring..." }) as HTMLButtonElement).disabled
    ).toBe(true);

    await act(async () => { resolveConfirm(); });
  });

  it("dialog does not render when snapshot is null", () => {
    render(
      <RestoreConfirmDialog
        snapshot={null}
        open={false}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("onOpenChange is blocked while isRestoring — Escape does not call onOpenChange", async () => {
    let resolveConfirm!: () => void;
    const pendingConfirm = vi.fn(
      () => new Promise<void>((resolve) => { resolveConfirm = resolve; })
    );

    render(
      <RestoreConfirmDialog
        snapshot={mockSnapshot}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={pendingConfirm}
      />
    );

    // Start the restore (sets isRestoring = true)
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));

    // Pressing Escape while isRestoring should NOT call onOpenChange
    await userEvent.keyboard("{Escape}");
    expect(mockOnOpenChange).not.toHaveBeenCalled();

    // Resolve and allow cleanup
    await act(async () => { resolveConfirm(); });
  });
});
