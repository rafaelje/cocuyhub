import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnapshotItem } from "./SnapshotItem";
import type { Snapshot } from "@/types";

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

describe("SnapshotItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders snapshot name", () => {
    render(<SnapshotItem snapshot={mockSnapshot} />);
    expect(screen.getByText("before refactor")).not.toBeNull();
  });

  it("renders 'auto' for empty name", () => {
    render(<SnapshotItem snapshot={{ ...mockSnapshot, name: "" }} />);
    expect(screen.getByText("auto")).not.toBeNull();
  });

  it("shows type badge 'auto' for auto snapshot", () => {
    render(<SnapshotItem snapshot={{ ...mockSnapshot, isAuto: true }} />);
    expect(screen.getByText("auto")).not.toBeNull();
  });

  it("shows type badge 'manual' for manual snapshot", () => {
    render(<SnapshotItem snapshot={mockSnapshot} />);
    expect(screen.getByText("manual")).not.toBeNull();
  });

  it("shows tool badge 'Code' for code tool", () => {
    render(<SnapshotItem snapshot={mockSnapshot} />);
    expect(screen.getByText("Code")).not.toBeNull();
  });

  it("shows tool badge 'Desktop' for desktop tool", () => {
    render(<SnapshotItem snapshot={{ ...mockSnapshot, tool: "desktop" }} />);
    expect(screen.getByText("Desktop")).not.toBeNull();
  });

  it("Restore button has correct aria-label", () => {
    render(<SnapshotItem snapshot={mockSnapshot} />);
    const btn = screen.getByRole("button", {
      name: "Restore snapshot from 2 hours ago",
    });
    expect(btn).not.toBeNull();
  });

  it("Restore button calls onRestore with snapshot id and tool", async () => {
    const mockOnRestore = vi.fn();
    render(<SnapshotItem snapshot={mockSnapshot} onRestore={mockOnRestore} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Restore snapshot from 2 hours ago" })
    );
    expect(mockOnRestore).toHaveBeenCalledWith("snap-1", "code");
  });

  it("Restore button is disabled when onRestore is not provided", () => {
    render(<SnapshotItem snapshot={mockSnapshot} />);
    const btn = screen.getByRole("button", {
      name: "Restore snapshot from 2 hours ago",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
