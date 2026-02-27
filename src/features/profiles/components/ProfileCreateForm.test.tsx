import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileCreateForm } from "./ProfileCreateForm";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useProfileStore", () => ({ useProfileStore: vi.fn() }));

import { useProfileStore } from "@/stores/useProfileStore";

describe("ProfileCreateForm", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
    vi.mocked(useProfileStore).mockImplementation((selector) =>
      selector({ profiles: [] } as never)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders name input without MCP checkboxes when open", () => {
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    expect(screen.getByLabelText(/Name/)).not.toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("shows char counter when name length is 20 or more", async () => {
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    const input = screen.getByLabelText(/Name/);
    await userEvent.type(input, "a".repeat(20));
    expect(screen.getByText("20/32")).not.toBeNull();
  });

  it("shows 'Profile name already exists' when name matches existing profile", async () => {
    vi.mocked(useProfileStore).mockImplementation((selector) =>
      selector({
        profiles: [
          {
            id: "p1",
            name: "Work",
            mcpServers: { code: {}, desktop: {} },
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      } as never)
    );
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    await userEvent.type(screen.getByLabelText(/Name/), "Work");
    expect(screen.getByText("Profile name already exists")).not.toBeNull();
  });

  it("Save button is disabled when name is empty", () => {
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("Save button is disabled when nameError is set", async () => {
    vi.mocked(useProfileStore).mockImplementation((selector) =>
      selector({
        profiles: [
          {
            id: "p1",
            name: "Duplicate",
            mcpServers: { code: {}, desktop: {} },
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      } as never)
    );
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    await userEvent.type(screen.getByLabelText(/Name/), "Duplicate");
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("Cancel calls onOpenChange(false) without calling onSubmit", async () => {
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("Save calls onSubmit with trimmed name only", async () => {
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    await userEvent.type(screen.getByLabelText(/Name/), "My Profile");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockOnSubmit).toHaveBeenCalledWith("My Profile");
    expect(mockOnSubmit.mock.calls[0]).toHaveLength(1);
  });

  it("form resets on close", async () => {
    const { rerender } = render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    await userEvent.type(screen.getByLabelText(/Name/), "Test");
    rerender(
      <ProfileCreateForm
        open={false}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    rerender(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe("");
  });
});
