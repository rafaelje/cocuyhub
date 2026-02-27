import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MCPRow } from "./MCPRow";

describe("MCPRow", () => {
  it("renders MCP name in a code element", () => {
    render(
      <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" />
    );
    const code = screen.getByText("my-server");
    expect(code.tagName).toBe("CODE");
  });

  it("shows switch as checked when disabled is not set", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" />
    );
    const switchEl = screen.getByRole("switch");
    expect(switchEl.getAttribute("aria-checked")).toBe("true");
  });

  it("shows switch as checked when disabled is explicitly false", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [], disabled: false }} tool="code" />
    );
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("shows switch as unchecked when disabled is true", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [], disabled: true }} tool="code" />
    );
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("has correct aria-label for code tool", () => {
    render(
      <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" />
    );
    expect(screen.getByRole("switch").getAttribute("aria-label")).toBe(
      "Enable my-server in Claude Code"
    );
  });

  it("has correct aria-label for desktop tool", () => {
    render(
      <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="desktop" />
    );
    expect(screen.getByRole("switch").getAttribute("aria-label")).toBe(
      "Enable my-server in Claude Desktop"
    );
  });

  it("has role='article' on the outer container", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" />
    );
    expect(screen.getByRole("article")).not.toBeNull();
  });

  it("shows a Claude Code badge for code tool", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" />
    );
    expect(screen.getByText("Claude Code")).not.toBeNull();
  });

  it("shows a Claude Desktop badge for desktop tool", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="desktop" />
    );
    expect(screen.getByText("Claude Desktop")).not.toBeNull();
  });

  // AC #9: Space key activates the focused switch
  it("switch is focusable and Space key toggles optimistic state", async () => {
    const mockOnToggle = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow
        name="mcp"
        config={{ command: "node", args: [] }}
        tool="code"
        onToggle={mockOnToggle}
      />
    );
    const switchEl = screen.getByRole("switch");
    switchEl.focus();
    expect(document.activeElement).toBe(switchEl);

    await userEvent.keyboard(" ");
    expect(mockOnToggle).toHaveBeenCalledWith("mcp", false);
  });

  // Optimistic toggle tests
  it("calls onToggle with new enabled state when switch is clicked", async () => {
    const mockOnToggle = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow
        name="mcp"
        config={{ command: "node", args: [], disabled: true }}
        tool="code"
        onToggle={mockOnToggle}
      />
    );
    await userEvent.click(screen.getByRole("switch"));
    expect(mockOnToggle).toHaveBeenCalledWith("mcp", true);
  });

  it("shows optimistic enabled state immediately before onToggle resolves", async () => {
    // Never-resolving promise: click completes but onToggle stays pending
    const neverResolves = new Promise<void>(() => {});
    const mockOnToggle = vi.fn().mockReturnValue(neverResolves);

    render(
      <MCPRow
        name="mcp"
        config={{ command: "node", args: [], disabled: true }}
        tool="code"
        onToggle={mockOnToggle}
      />
    );

    const switchEl = screen.getByRole("switch");
    expect(switchEl.getAttribute("aria-checked")).toBe("false");

    await userEvent.click(switchEl);
    // onToggle is pending but optimistic state should already be updated
    expect(switchEl.getAttribute("aria-checked")).toBe("true");
  });

  it("rolls back switch state when onToggle rejects", async () => {
    const mockOnToggle = vi.fn().mockRejectedValue(new Error("write failed"));
    render(
      <MCPRow
        name="mcp"
        config={{ command: "node", args: [] }}
        tool="code"
        onToggle={mockOnToggle}
      />
    );
    const switchEl = screen.getByRole("switch");
    expect(switchEl.getAttribute("aria-checked")).toBe("true");

    await userEvent.click(switchEl);

    // After rejection, switch should revert to original state
    expect(switchEl.getAttribute("aria-checked")).toBe("true");
  });

  it("does nothing when switch is clicked without onToggle prop", async () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" />
    );
    const switchEl = screen.getByRole("switch");
    // Should not throw
    await userEvent.click(switchEl);
    expect(switchEl.getAttribute("aria-checked")).toBe("true");
  });

  // Story 2.5: Delete button and confirmation dialog
  it("delete button has correct aria-label for code tool", () => {
    const mockOnDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" onDelete={mockOnDelete} />
    );
    expect(
      screen.getByRole("button", { name: "Remove my-mcp from Claude Code" })
    ).not.toBeNull();
  });

  it("delete button has correct aria-label for desktop tool", () => {
    const mockOnDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="desktop" onDelete={mockOnDelete} />
    );
    expect(
      screen.getByRole("button", { name: "Remove my-mcp from Claude Desktop" })
    ).not.toBeNull();
  });

  it("clicking delete button opens confirmation dialog", async () => {
    const mockOnDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" onDelete={mockOnDelete} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove my-mcp from Claude Code" })
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByText("Remove MCP?")).not.toBeNull();
  });

  it("clicking Cancel in dialog does NOT call onDelete", async () => {
    const mockOnDelete = vi.fn();
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" onDelete={mockOnDelete} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove my-mcp from Claude Code" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  it("clicking Confirm in dialog calls onDelete with name", async () => {
    const mockOnDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" onDelete={mockOnDelete} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove my-mcp from Claude Code" })
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockOnDelete).toHaveBeenCalledWith("my-mcp");
  });

  it("dialog closes after clicking Confirm", async () => {
    const mockOnDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" onDelete={mockOnDelete} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove my-mcp from Claude Code" })
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("no delete button rendered when onDelete prop is not provided", () => {
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" />
    );
    expect(
      screen.queryByRole("button", { name: "Remove my-mcp from Claude Code" })
    ).toBeNull();
  });

  // M2 fix: useEffect re-syncs optimisticEnabled when config.disabled prop changes
  it("re-syncs switch state when config.disabled prop changes from parent", () => {
    const { rerender } = render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" />
    );
    const switchEl = screen.getByRole("switch");
    expect(switchEl.getAttribute("aria-checked")).toBe("true");

    // Simulate parent updating config (e.g., after store reload confirms disabled)
    rerender(
      <MCPRow name="mcp" config={{ command: "node", args: [], disabled: true }} tool="code" />
    );
    expect(switchEl.getAttribute("aria-checked")).toBe("false");
  });
});
