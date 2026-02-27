import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useProfileStore", () => ({ useProfileStore: vi.fn() }));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: vi.fn() }));
vi.mock("./DiffPreviewDialog", () => ({
  DiffPreviewDialog: vi.fn(
    ({ open }: { open: boolean }) =>
      open ? <div data-testid="diff-preview-dialog" /> : null
  ),
}));

import { useProfileStore } from "@/stores/useProfileStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { ProfileSwitcher } from "./ProfileSwitcher";
import type { Profile } from "@/types";

const makeProfile = (id: string, name: string, mcpCount = 2): Profile => ({
  id,
  name,
  mcpServers: {
    code: Object.fromEntries(
      Array.from({ length: mcpCount }, (_, i) => [`mcp-${i}`, { command: "node", args: [] }])
    ),
    desktop: {},
  },
  createdAt: "2026-01-01T00:00:00Z",
});

function setupStore(
  profiles: Profile[],
  activeProfileId: string | null,
  computeMixedState: (tool: string) => boolean = () => false
) {
  vi.mocked(useProfileStore).mockImplementation((selector) =>
    selector({ profiles, activeProfileId, computeMixedState } as never)
  );
  vi.mocked(useProfileStore).getState = vi.fn().mockReturnValue({
    setActiveProfileId: vi.fn(),
  });
  vi.mocked(useConfigStore).mockImplementation((selector) =>
    selector({ codeConfig: null } as never)
  );
}

describe("ProfileSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows 'No Profile' when activeProfileId is null", () => {
    setupStore([], null);
    render(<ProfileSwitcher />);
    expect(screen.getByText("No Profile")).not.toBeNull();
  });

  it("shows active profile name when activeProfileId is set", () => {
    const profiles = [makeProfile("p1", "Work")];
    setupStore(profiles, "p1");
    render(<ProfileSwitcher />);
    expect(screen.getByText("Work")).not.toBeNull();
  });

  it("does not show 'No Profile' when a profile is active", () => {
    const profiles = [makeProfile("p1", "Work")];
    setupStore(profiles, "p1");
    render(<ProfileSwitcher />);
    expect(screen.queryByText("No Profile")).toBeNull();
  });

  it("trigger button has aria-haspopup='listbox'", () => {
    setupStore([], null);
    render(<ProfileSwitcher />);
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
  });

  it("clicking trigger opens dropdown", async () => {
    setupStore([makeProfile("p1", "Work")], null);
    render(<ProfileSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Work")).not.toBeNull();
  });

  it("dropdown shows 'No profiles yet.' when profiles is empty", async () => {
    setupStore([], null);
    render(<ProfileSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("No profiles yet.")).not.toBeNull();
  });

  it("dropdown shows profile name and MCP count", async () => {
    setupStore([makeProfile("p1", "Work", 3)], null);
    render(<ProfileSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Work")).not.toBeNull();
    expect(screen.getByText("3 MCPs")).not.toBeNull();
  });

  it("clicking non-active profile opens DiffPreviewDialog with correct profile", async () => {
    setupStore([makeProfile("p1", "Work"), makeProfile("p2", "Research")], "p1");
    render(<ProfileSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByText("Research"));
    // Dialog is rendered open after clicking non-active profile
    expect(screen.getByTestId("diff-preview-dialog")).not.toBeNull();
  });

  it("clicking active profile does NOT open DiffPreviewDialog", async () => {
    setupStore([makeProfile("p1", "Work"), makeProfile("p2", "Research")], "p1");
    render(<ProfileSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    // Work is the active profile — it appears in both the trigger and the dropdown
    // Click the dropdown item for "Work" (active profile)
    const workItems = screen.getAllByText("Work");
    // The dropdown item is the one inside the dropdown content
    await userEvent.click(workItems[workItems.length - 1]);
    // Dialog should NOT be open
    expect(screen.queryByTestId("diff-preview-dialog")).toBeNull();
  });

  it("active profile entry shows emerald indicator in dropdown", async () => {
    setupStore([makeProfile("p1", "Work"), makeProfile("p2", "Research")], "p1");
    const { container } = render(<ProfileSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    const dropdownContent = container.querySelector(
      "[data-slot='dropdown-menu-content']"
    );
    const emeraldDot = dropdownContent?.querySelector(".bg-emerald-500");
    expect(emeraldDot).not.toBeNull();
  });

  it("shows amber 'Mixed' badge when profile is active and computeMixedState returns true", () => {
    const profiles = [makeProfile("p1", "Work")];
    setupStore(profiles, "p1", () => true);
    render(<ProfileSwitcher />);
    expect(screen.getByText("Mixed")).not.toBeNull();
  });

  it("shows emerald dot (not Mixed) when profile is active but computeMixedState returns false", () => {
    const profiles = [makeProfile("p1", "Work")];
    setupStore(profiles, "p1", () => false);
    const { container } = render(<ProfileSwitcher />);
    expect(screen.queryByText("Mixed")).toBeNull();
    const triggerButton = container.querySelector("button[aria-haspopup='listbox']");
    const emeraldDot = triggerButton?.querySelector(".bg-emerald-500");
    expect(emeraldDot).not.toBeNull();
  });

  it("does not show Mixed badge when no profile is active", () => {
    setupStore([], null, () => true);
    render(<ProfileSwitcher />);
    expect(screen.queryByText("Mixed")).toBeNull();
  });
});
