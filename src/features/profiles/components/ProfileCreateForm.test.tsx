import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileCreateForm } from "./ProfileCreateForm";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: vi.fn() }));
vi.mock("@/stores/useProfileStore", () => ({ useProfileStore: vi.fn() }));

import { useConfigStore } from "@/stores/useConfigStore";
import { useProfileStore } from "@/stores/useProfileStore";
import type { ClaudeConfig } from "@/types";

const mockConfig: ClaudeConfig = {
  mcpServers: {
    "mcp-github": { command: "node", args: [] },
    "mcp-disabled": { command: "node", args: [], disabled: true },
    "mcp-active": { command: "node", args: [] },
  },
};

describe("ProfileCreateForm", () => {
  const mockOnOpenChange = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
    vi.mocked(useConfigStore).mockImplementation((selector) =>
      selector({ codeConfig: mockConfig, desktopConfig: mockConfig } as never)
    );
    vi.mocked(useProfileStore).mockImplementation((selector) =>
      selector({ profiles: [] } as never)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders name input and MCP checkbox list when open", () => {
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    expect(screen.getByLabelText(/Name/)).not.toBeNull();
    expect(screen.getByText("mcp-github")).not.toBeNull();
    expect(screen.getByText("mcp-disabled")).not.toBeNull();
    expect(screen.getByText("mcp-active")).not.toBeNull();
  });

  it("pre-selects currently enabled MCPs from codeConfig", () => {
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // mcp-github: enabled → checked
    const githubBox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label?.textContent?.includes("mcp-github");
    });
    expect(githubBox?.checked).toBe(true);
    // mcp-disabled: disabled → unchecked
    const disabledBox = checkboxes.find((cb) => {
      const label = cb.closest("label");
      return label?.textContent?.includes("mcp-disabled");
    });
    expect(disabledBox?.checked).toBe(false);
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
            activeMcps: [],
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
            activeMcps: [],
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

  it("Save calls onSubmit with trimmed name and selected MCPs", async () => {
    render(
      <ProfileCreateForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
    await userEvent.type(screen.getByLabelText(/Name/), "My Profile");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockOnSubmit).toHaveBeenCalledWith(
      "My Profile",
      expect.arrayContaining(["mcp-github", "mcp-active"])
    );
    // mcp-disabled should NOT be in the activeMcps
    const [, activeMcps] = mockOnSubmit.mock.calls[0] as [string, string[]];
    expect(activeMcps).not.toContain("mcp-disabled");
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
