import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SnapshotList } from "./SnapshotList";
import type { Snapshot } from "@/types";

const mockGetDateGroup = vi.fn(() => "Today" as const);

vi.mock("@/lib/format-date", () => ({
  formatRelativeTime: vi.fn(() => "2 hours ago"),
  formatAbsoluteTime: vi.fn(() => "2026-02-26T14:00:00.000Z"),
  getDateGroup: (...args: unknown[]) => mockGetDateGroup(...args),
}));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

const makeSnapshot = (id: string, name: string): Snapshot => ({
  id,
  name,
  timestamp: "1706308200000",
  tool: "code",
  content: "{}",
  isAuto: false,
});

describe("SnapshotList", () => {
  beforeEach(() => {
    mockGetDateGroup.mockReturnValue("Today");
  });

  it("renders nothing when snapshots is empty", () => {
    const { container } = render(<SnapshotList snapshots={[]} />);
    expect(container.querySelector("section")).toBeNull();
  });

  it("renders SnapshotItems for each snapshot", () => {
    const snapshots = [makeSnapshot("1", "snap one"), makeSnapshot("2", "snap two")];
    render(<SnapshotList snapshots={snapshots} />);
    expect(screen.getByText("snap one")).not.toBeNull();
    expect(screen.getByText("snap two")).not.toBeNull();
  });

  it("renders Today section for recent snapshot", () => {
    mockGetDateGroup.mockReturnValue("Today");
    render(<SnapshotList snapshots={[makeSnapshot("1", "today snap")]} />);
    const section = screen.getByRole("region", { name: "Today" });
    expect(section).not.toBeNull();
    expect(within(section).getByText("today snap")).not.toBeNull();
  });

  it("renders Older section for old snapshot", () => {
    mockGetDateGroup.mockReturnValue("Older");
    render(<SnapshotList snapshots={[makeSnapshot("1", "old snap")]} />);
    const section = screen.getByRole("region", { name: "Older" });
    expect(section).not.toBeNull();
    expect(within(section).getByText("old snap")).not.toBeNull();
  });

  it("each section has correct aria-label", () => {
    mockGetDateGroup
      .mockReturnValueOnce("Today")
      .mockReturnValueOnce("Older");
    const snapshots = [
      makeSnapshot("1", "snap today"),
      makeSnapshot("2", "snap older"),
    ];
    render(<SnapshotList snapshots={snapshots} />);
    expect(screen.getByRole("region", { name: "Today" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Older" })).not.toBeNull();
  });
});
