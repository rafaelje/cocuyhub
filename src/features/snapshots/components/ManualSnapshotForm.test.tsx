import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualSnapshotForm } from "./ManualSnapshotForm";

describe("ManualSnapshotForm", () => {
  const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
  const mockOnOpenChange = vi.fn();

  function renderForm(overrides: Partial<React.ComponentProps<typeof ManualSnapshotForm>> = {}) {
    return render(
      <ManualSnapshotForm
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
        {...overrides}
      />
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name input and tool selector when open", () => {
    renderForm();
    expect(
      screen.getByPlaceholderText('e.g. "Before adding GitHub MCP"')
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Claude Code" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Claude Desktop" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Both" })).not.toBeNull();
  });

  it("name input accepts text", async () => {
    renderForm();
    const input = screen.getByPlaceholderText(
      'e.g. "Before adding GitHub MCP"'
    ) as HTMLInputElement;
    await userEvent.type(input, "before refactor");
    expect(input.value).toBe("before refactor");
  });

  it("does not show char counter below 50 chars", () => {
    renderForm();
    expect(screen.queryByText(/\/64/)).toBeNull();
  });

  it("shows char counter when name length is 50 or more", async () => {
    renderForm();
    const input = screen.getByPlaceholderText('e.g. "Before adding GitHub MCP"');
    await userEvent.type(input, "a".repeat(50));
    expect(screen.getByText("50/64")).not.toBeNull();
  });

  it("does not allow more than 64 characters", async () => {
    renderForm();
    const input = screen.getByPlaceholderText(
      'e.g. "Before adding GitHub MCP"'
    ) as HTMLInputElement;
    await userEvent.type(input, "a".repeat(70));
    expect(input.value.length).toBe(64);
  });

  it("tool selector defaults to Both", () => {
    renderForm();
    // Both button should appear highlighted (bg-zinc-700)
    // We verify by checking the aria or visual state — use DOM class inspection
    const bothBtn = screen.getByRole("button", { name: "Both" });
    expect(bothBtn.className).toContain("bg-zinc-700");
  });

  it("can select Claude Code tool", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    const codeBtn = screen.getByRole("button", { name: "Claude Code" });
    expect(codeBtn.className).toContain("bg-zinc-700");
  });

  it("can select Claude Desktop tool", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Claude Desktop" }));
    const desktopBtn = screen.getByRole("button", { name: "Claude Desktop" });
    expect(desktopBtn.className).toContain("bg-zinc-700");
  });

  it("Cancel button calls onOpenChange(false) without calling onSubmit", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("Create Snapshot button calls onSubmit with name and ['code','desktop'] for Both", async () => {
    renderForm();
    const input = screen.getByPlaceholderText('e.g. "Before adding GitHub MCP"');
    await userEvent.type(input, "my snapshot");
    await userEvent.click(screen.getByRole("button", { name: "Create Snapshot" }));
    expect(mockOnSubmit).toHaveBeenCalledWith("my snapshot", ["code", "desktop"]);
  });

  it("Create button calls onSubmit with ['code'] when Claude Code is selected", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    await userEvent.click(screen.getByRole("button", { name: "Create Snapshot" }));
    expect(mockOnSubmit).toHaveBeenCalledWith("", ["code"]);
  });

  it("Create button calls onSubmit with ['desktop'] when Claude Desktop is selected", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Claude Desktop" }));
    await userEvent.click(screen.getByRole("button", { name: "Create Snapshot" }));
    expect(mockOnSubmit).toHaveBeenCalledWith("", ["desktop"]);
  });

  it("Create button calls onOpenChange(false) after submit completes", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Create Snapshot" }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("Create button is disabled while isSubmitting", async () => {
    let resolveSubmit!: () => void;
    const pendingSubmit = vi.fn(
      () => new Promise<void>((resolve) => { resolveSubmit = resolve; })
    );
    renderForm({ onSubmit: pendingSubmit });
    await userEvent.click(screen.getByRole("button", { name: "Create Snapshot" }));
    const createBtn = screen.getByRole("button", { name: "Creating..." });
    expect((createBtn as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveSubmit(); });
  });

  it("does not render dialog content when open is false", () => {
    renderForm({ open: false });
    expect(screen.queryByText("Create Snapshot")).toBeNull();
  });
});
