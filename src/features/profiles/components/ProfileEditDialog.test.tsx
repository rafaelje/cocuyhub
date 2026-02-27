import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useProfileStore", () => ({ useProfileStore: vi.fn() }));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: vi.fn() }));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useProfileStore } from "@/stores/useProfileStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { invokeCommand } from "@/lib/ipc";
import { toast } from "sonner";
import { ProfileEditDialog } from "./ProfileEditDialog";
import type { ClaudeConfig, Profile } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);
const mockUpdateProfile = vi.fn();
const mockOnOpenChange = vi.fn();

const makeProfile = (id: string, name: string): Profile => ({
  id,
  name,
  mcpServers: { code: {}, desktop: {} },
  createdAt: "2026-01-01T00:00:00Z",
});

const makeConfig = (mcps: string[]): ClaudeConfig => ({
  mcpServers: Object.fromEntries(mcps.map((n) => [n, { command: "node", args: [] }])),
});

function setupStores(
  profiles: Profile[] = [],
  codeConfig: ClaudeConfig | null = null
) {
  vi.mocked(useProfileStore).mockImplementation((selector) =>
    selector({ profiles } as never)
  );
  vi.mocked(useProfileStore).getState = vi.fn().mockReturnValue({
    updateProfile: mockUpdateProfile,
  });
  vi.mocked(useConfigStore).mockImplementation((selector) =>
    selector({ codeConfig, desktopConfig: null } as never)
  );
}

describe("ProfileEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when profile is null", () => {
    setupStores();
    const { container } = render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("pre-populates name input with profile.name on open", () => {
    const profile = makeProfile("p1", "Work");
    setupStores([profile]);
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    const input = screen.getByLabelText(/Name/) as HTMLInputElement;
    expect(input.value).toBe("Work");
  });

  it("shows name error when name matches another profile", async () => {
    const profile = makeProfile("p1", "Work");
    const other = makeProfile("p2", "Research");
    setupStores([profile, other]);
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    const input = screen.getByLabelText(/Name/);
    await userEvent.clear(input);
    await userEvent.type(input, "Research");
    expect(screen.getByText("Profile name already exists")).not.toBeNull();
  });

  it("does NOT show name error for the current profile own name", async () => {
    const profile = makeProfile("p1", "Work");
    setupStores([profile]);
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    const input = screen.getByLabelText(/Name/);
    await userEvent.clear(input);
    await userEvent.type(input, "Work");
    expect(screen.queryByText("Profile name already exists")).toBeNull();
  });

  it("clicking Save changes calls invokeCommand with profile_update", async () => {
    const profile = makeProfile("p1", "Work");
    setupStores([profile]);
    const updatedProfile = makeProfile("p1", "Work Updated");
    mockInvokeCommand.mockResolvedValue(updatedProfile);
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    const input = screen.getByLabelText(/Name/);
    await userEvent.clear(input);
    await userEvent.type(input, "Work Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("profile_update", {
      id: "p1",
      name: "Work Updated",
    });
  });

  it("on success: calls updateProfile, toast.success, onOpenChange(false)", async () => {
    const profile = makeProfile("p1", "Work");
    const updatedProfile = makeProfile("p1", "Work Updated");
    setupStores([profile]);
    mockInvokeCommand.mockResolvedValue(updatedProfile);
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    const input = screen.getByLabelText(/Name/);
    await userEvent.clear(input);
    await userEvent.type(input, "Work Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(updatedProfile);
    expect(mockToastSuccess).toHaveBeenCalledWith("Profile Work Updated updated");
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("on error: toast.error, does NOT call onOpenChange", async () => {
    const profile = makeProfile("p1", "Work");
    setupStores([profile]);
    mockInvokeCommand.mockRejectedValue(new Error("write failed"));
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to update profile: write failed",
      { duration: Infinity }
    );
    expect(mockOnOpenChange).not.toHaveBeenCalled();
  });

  it("clicking Cancel calls onOpenChange(false)", async () => {
    const profile = makeProfile("p1", "Work");
    setupStores([profile]);
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("Save changes button is disabled when name is empty", async () => {
    const profile = makeProfile("p1", "Work");
    setupStores([profile]);
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    const input = screen.getByLabelText(/Name/);
    await userEvent.clear(input);
    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Save changes button is disabled and shows Saving while isSubmitting", async () => {
    const profile = makeProfile("p1", "Work");
    setupStores([profile]);
    mockInvokeCommand.mockReturnValue(new Promise(() => {}));
    render(
      <ProfileEditDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const savingBtn = screen.getByRole("button", { name: "Saving..." });
    expect(savingBtn).not.toBeNull();
    expect((savingBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
