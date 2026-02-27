import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useProfileStore", () => ({ useProfileStore: vi.fn() }));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useProfileStore } from "@/stores/useProfileStore";
import { invokeCommand } from "@/lib/ipc";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import type { Profile } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);
const mockRemoveProfile = vi.fn();
const mockSetActiveProfileId = vi.fn();
const mockOnOpenChange = vi.fn();

const makeProfile = (id: string, name: string): Profile => ({
  id,
  name,
  mcpServers: { code: {}, desktop: {} },
  createdAt: "2026-01-01T00:00:00Z",
});

function setupStore(activeProfileId: string | null = null) {
  vi.mocked(useProfileStore).mockImplementation((selector) =>
    selector({ profiles: [], activeProfileId } as never)
  );
  vi.mocked(useProfileStore).getState = vi.fn().mockReturnValue({
    activeProfileId,
    removeProfile: mockRemoveProfile,
    setActiveProfileId: mockSetActiveProfileId,
  });
}

describe("DeleteConfirmDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when profile is null", () => {
    const { container } = render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows profile name in description", () => {
    const profile = makeProfile("p1", "Work");
    setupStore();
    render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    expect(screen.getByText(/Delete profile Work/)).not.toBeNull();
    expect(screen.getByText(/This action cannot be undone/)).not.toBeNull();
  });

  it("clicking Confirm calls invokeCommand with profile_delete", async () => {
    const profile = makeProfile("p1", "Work");
    setupStore();
    mockInvokeCommand.mockResolvedValue(undefined);
    render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("profile_delete", { id: "p1" });
  });

  it("on success: calls removeProfile, toast.success, onOpenChange(false)", async () => {
    const profile = makeProfile("p1", "Work");
    setupStore("other-id");
    mockInvokeCommand.mockResolvedValue(undefined);
    render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockRemoveProfile).toHaveBeenCalledWith("p1");
    expect(mockToastSuccess).toHaveBeenCalledWith("Profile Work deleted");
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("on success: calls setActiveProfileId(null) when deleted profile was active", async () => {
    const profile = makeProfile("p1", "Work");
    setupStore("p1"); // p1 is active
    mockInvokeCommand.mockResolvedValue(undefined);
    render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockSetActiveProfileId).toHaveBeenCalledWith(null);
  });

  it("on success: does NOT call setActiveProfileId(null) when deleted profile was NOT active", async () => {
    const profile = makeProfile("p1", "Work");
    setupStore("p2"); // different profile is active
    mockInvokeCommand.mockResolvedValue(undefined);
    render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockSetActiveProfileId).not.toHaveBeenCalled();
  });

  it("on error: toast.error, does NOT call removeProfile", async () => {
    const profile = makeProfile("p1", "Work");
    setupStore();
    mockInvokeCommand.mockRejectedValue(new Error("delete failed"));
    render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to delete profile: delete failed",
      { duration: Infinity }
    );
    expect(mockRemoveProfile).not.toHaveBeenCalled();
  });

  it("Delete button shows 'Deleting...' and is disabled while isDeleting", async () => {
    const profile = makeProfile("p1", "Work");
    setupStore();
    mockInvokeCommand.mockReturnValue(new Promise(() => {}));
    render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const deletingBtn = screen.getByRole("button", { name: "Deleting..." });
    expect(deletingBtn).not.toBeNull();
    expect((deletingBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("clicking Cancel calls onOpenChange(false)", async () => {
    const profile = makeProfile("p1", "Work");
    setupStore();
    render(
      <DeleteConfirmDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});
