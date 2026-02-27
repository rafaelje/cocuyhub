import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("@/stores/useProfileStore", () => ({ useProfileStore: vi.fn() }));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { invokeCommand } from "@/lib/ipc";
import { useProfileStore } from "@/stores/useProfileStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { toast } from "sonner";
import { ProfilesView } from "./ProfilesView";
import type { ClaudeConfig, Profile } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);
const mockFetchProfiles = vi.fn().mockResolvedValue(undefined);
const mockAddProfile = vi.fn();

const mockConfig: ClaudeConfig = { mcpServers: {} };

const makeProfile = (id: string, name: string): Profile => ({
  id,
  name,
  mcpServers: { code: {}, desktop: {} },
  createdAt: "2026-01-01T00:00:00Z",
});

describe("ProfilesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProfileStore).mockImplementation((selector) =>
      selector({ profiles: [], isLoading: false } as never)
    );
    vi.mocked(useProfileStore).getState = vi.fn().mockReturnValue({
      fetchProfiles: mockFetchProfiles,
      addProfile: mockAddProfile,
    });
    vi.mocked(useConfigStore).mockImplementation((selector) =>
      selector({ codeConfig: mockConfig, desktopConfig: mockConfig } as never)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Create Profile button", () => {
    render(<ProfilesView />);
    expect(
      screen.getByRole("button", { name: "Create Profile" })
    ).not.toBeNull();
  });

  it("renders empty state when profiles is empty", () => {
    render(<ProfilesView />);
    expect(
      screen.getByText(
        "No profiles yet. Create one to save your current MCP setup."
      )
    ).not.toBeNull();
  });

  it("clicking Create Profile opens the form dialog", async () => {
    render(<ProfilesView />);
    await userEvent.click(screen.getByRole("button", { name: "Create Profile" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("fetchProfiles is called on mount", () => {
    render(<ProfilesView />);
    expect(mockFetchProfiles).toHaveBeenCalled();
  });

  it("successful create calls toast.success with profile name", async () => {
    mockInvokeCommand.mockResolvedValue(makeProfile("p1", "Work"));
    render(<ProfilesView />);
    await userEvent.click(screen.getByRole("button", { name: "Create Profile" }));
    const dialog = screen.getByRole("dialog");
    const nameInput = dialog.querySelector("input[id='profile-name']") as HTMLInputElement;
    await userEvent.type(nameInput, "Work");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("profile_create", { name: "Work" });
    expect(mockToastSuccess).toHaveBeenCalledWith("Profile Work created", {
      duration: 3000,
    });
  });

  it("failed create calls toast.error", async () => {
    mockInvokeCommand.mockRejectedValue({ message: "Profile already exists" });
    render(<ProfilesView />);
    await userEvent.click(screen.getByRole("button", { name: "Create Profile" }));
    const dialog = screen.getByRole("dialog");
    const nameInput = dialog.querySelector("input[id='profile-name']") as HTMLInputElement;
    await userEvent.type(nameInput, "Work");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to create profile: Profile already exists",
      { duration: Infinity }
    );
  });

  it("successful create calls addProfile on useProfileStore", async () => {
    const newProfile = makeProfile("p1", "Work");
    mockInvokeCommand.mockResolvedValue(newProfile);
    render(<ProfilesView />);
    await userEvent.click(screen.getByRole("button", { name: "Create Profile" }));
    const dialog = screen.getByRole("dialog");
    const nameInput = dialog.querySelector("input[id='profile-name']") as HTMLInputElement;
    await userEvent.type(nameInput, "Work");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockAddProfile).toHaveBeenCalledWith(newProfile);
  });
});
