import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useProfileStore", () => ({ useProfileStore: vi.fn() }));
vi.mock("./DiffPreviewDialog", () => ({
  DiffPreviewDialog: vi.fn(
    ({ open }: { open: boolean }) =>
      open ? <div data-testid="diff-preview-dialog" /> : null
  ),
}));
vi.mock("./ProfileEditDialog", () => ({
  ProfileEditDialog: vi.fn(
    ({ open }: { open: boolean }) =>
      open ? <div data-testid="profile-edit-dialog" /> : null
  ),
}));
vi.mock("./DeleteConfirmDialog", () => ({
  DeleteConfirmDialog: vi.fn(
    ({ open }: { open: boolean }) =>
      open ? <div data-testid="delete-confirm-dialog" /> : null
  ),
}));

import { useProfileStore } from "@/stores/useProfileStore";
import { ProfileList } from "./ProfileList";
import type { Profile } from "@/types";

const makeProfile = (id: string, name: string): Profile => ({
  id,
  name,
  mcpServers: { code: { "mcp-a": { command: "node", args: [] } }, desktop: {} },
  createdAt: "2026-01-01T00:00:00Z",
});

function setupStore(profiles: Profile[], activeProfileId: string | null) {
  vi.mocked(useProfileStore).mockImplementation((selector) =>
    selector({ profiles, activeProfileId } as never)
  );
  vi.mocked(useProfileStore).getState = vi.fn().mockReturnValue({
    setActiveProfileId: vi.fn(),
  });
}

describe("ProfileList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a ProfileCard for each profile", () => {
    setupStore(
      [makeProfile("p1", "Work"), makeProfile("p2", "Research")],
      null
    );
    render(<ProfileList />);
    expect(screen.getByText("Work")).not.toBeNull();
    expect(screen.getByText("Research")).not.toBeNull();
  });

  it("passes isActive=true to the active profile's card", () => {
    setupStore(
      [makeProfile("p1", "Work"), makeProfile("p2", "Research")],
      "p1"
    );
    render(<ProfileList />);
    expect(screen.getByText("Active")).not.toBeNull();
  });

  it("passes isActive=false to non-active profiles — no Active badge for non-active", () => {
    setupStore(
      [makeProfile("p1", "Work"), makeProfile("p2", "Research")],
      "p1"
    );
    render(<ProfileList />);
    expect(screen.getAllByText("Active")).toHaveLength(1);
  });

  it("clicking Switch on a ProfileCard opens DiffPreviewDialog with correct profile", async () => {
    setupStore(
      [makeProfile("p1", "Work"), makeProfile("p2", "Research")],
      "p1"
    );
    render(<ProfileList />);
    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(screen.getByTestId("diff-preview-dialog")).not.toBeNull();
  });

  it("clicking Edit on a ProfileCard opens ProfileEditDialog", async () => {
    setupStore(
      [makeProfile("p1", "Work"), makeProfile("p2", "Research")],
      "p1"
    );
    render(<ProfileList />);
    // Click the first Edit button
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByTestId("profile-edit-dialog")).not.toBeNull();
  });

  it("clicking Delete on a ProfileCard opens DeleteConfirmDialog", async () => {
    setupStore(
      [makeProfile("p1", "Work"), makeProfile("p2", "Research")],
      "p1"
    );
    render(<ProfileList />);
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(screen.getByTestId("delete-confirm-dialog")).not.toBeNull();
  });

  it("renders no profile cards when profiles is empty", () => {
    setupStore([], null);
    render(<ProfileList />);
    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.queryByRole("button", { name: "Switch" })).toBeNull();
  });
});
