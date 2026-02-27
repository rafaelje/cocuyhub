import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { MCPRow } from "./MCPRow";

// Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

describe("MCPRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
  });

  it("renders MCP name in a code element", () => {
    render(
      <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    const code = screen.getByText("my-server");
    expect(code.tagName).toBe("CODE");
  });

  it("shows switch as checked when enabled prop is true", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    const switchEl = screen.getByRole("switch");
    expect(switchEl.getAttribute("aria-checked")).toBe("true");
  });

  it("shows switch as unchecked when enabled prop is false", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={false} />
    );
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("has correct aria-label for code tool", () => {
    render(
      <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    expect(screen.getByRole("switch").getAttribute("aria-label")).toBe(
      "Enable my-server in Claude Code"
    );
  });

  it("has correct aria-label for desktop tool", () => {
    render(
      <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="desktop" enabled={true} />
    );
    expect(screen.getByRole("switch").getAttribute("aria-label")).toBe(
      "Enable my-server in Claude Desktop"
    );
  });

  it("has role='article' on the outer container", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    expect(screen.getByRole("article")).not.toBeNull();
  });

  it("shows a Claude Code badge for code tool", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    expect(screen.getByText("Claude Code")).not.toBeNull();
  });

  it("shows a Claude Desktop badge for desktop tool", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="desktop" enabled={true} />
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
        enabled={true}
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
        config={{ command: "node", args: [] }}
        tool="code"
        enabled={false}
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
        config={{ command: "node", args: [] }}
        tool="code"
        enabled={false}
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
        enabled={true}
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
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
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
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} onDelete={mockOnDelete} />
    );
    expect(
      screen.getByRole("button", { name: "Remove my-mcp from Claude Code" })
    ).not.toBeNull();
  });

  it("delete button has correct aria-label for desktop tool", () => {
    const mockOnDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="desktop" enabled={true} onDelete={mockOnDelete} />
    );
    expect(
      screen.getByRole("button", { name: "Remove my-mcp from Claude Desktop" })
    ).not.toBeNull();
  });

  it("clicking delete button opens confirmation dialog", async () => {
    const mockOnDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} onDelete={mockOnDelete} />
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
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} onDelete={mockOnDelete} />
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
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} onDelete={mockOnDelete} />
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
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} onDelete={mockOnDelete} />
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
      <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    expect(
      screen.queryByRole("button", { name: "Remove my-mcp from Claude Code" })
    ).toBeNull();
  });

  // copy-to-other button tests
  it("shows copy-to-other button when onCopyToOther is provided", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
        onCopyToOther={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Copy mcp to Claude Desktop" })).not.toBeNull();
  });

  it("does not show copy-to-other button when onCopyToOther is not provided", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    expect(screen.queryByRole("button", { name: "Copy mcp to Claude Desktop" })).toBeNull();
  });

  it("calls onCopyToOther with name and config when copy-to-other button is clicked", async () => {
    const mockCopy = vi.fn().mockResolvedValue(undefined);
    const config = { command: "node", args: ["index.js"] };
    render(<MCPRow name="mcp" config={config} tool="code" enabled={true} onCopyToOther={mockCopy} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy mcp to Claude Desktop" }));
    expect(mockCopy).toHaveBeenCalledWith("mcp", config);
  });

  it("uses correct other tool label for desktop tool", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="desktop" enabled={true}
        onCopyToOther={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Copy mcp to Claude Code" })).not.toBeNull();
  });

  // copy JSON button tests
  it("copy JSON button is always visible regardless of onCopyToOther", () => {
    render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    expect(screen.getByRole("button", { name: "Copy JSON for mcp" })).not.toBeNull();
  });

  it("copy JSON button writes correct snippet to clipboard", async () => {
    const config = { command: "node", args: ["index.js"], env: { TOKEN: "abc" } };
    render(<MCPRow name="my-mcp" config={config} tool="code" enabled={true} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy JSON for my-mcp" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ mcpServers: { "my-mcp": config } }, null, 2)
    );
  });

  it("copy JSON shows success toast after writing to clipboard", async () => {
    render(<MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy JSON for mcp" }));
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("JSON copied to clipboard", { duration: 3000 });
  });

  // Inline rename tests
  describe("inline rename", () => {
    it("double-click on name shows input with current value when onRename is provided", async () => {
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={vi.fn()} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement).value).toBe("my-mcp");
    });

    it("double-click on name does NOT show input when onRename is not provided", async () => {
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("typing a new name and pressing Enter calls onRename with old and new name", async () => {
      const mockOnRename = vi.fn().mockResolvedValue(undefined);
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "new-name");
      await userEvent.keyboard("{Enter}");
      expect(mockOnRename).toHaveBeenCalledWith("my-mcp", "new-name");
    });

    it("pressing Escape cancels and restores original name without calling onRename", async () => {
      const mockOnRename = vi.fn();
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "different-name");
      await userEvent.keyboard("{Escape}");
      expect(mockOnRename).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.getByText("my-mcp")).not.toBeNull();
    });

    it("F1: pressing Escape then blur does NOT call onRename (race condition guard)", async () => {
      // Escape sets cancelledRef; the subsequent blur must be ignored
      const mockOnRename = vi.fn();
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "valid-name");
      // Escape first — then click away (triggers blur)
      await userEvent.keyboard("{Escape}");
      await userEvent.click(document.body);
      expect(mockOnRename).not.toHaveBeenCalled();
    });

    it("blur on the input calls onRename", async () => {
      const mockOnRename = vi.fn().mockResolvedValue(undefined);
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "blurred-name");
      // F9: use userEvent.click away to trigger blur in a way that userEvent tracks
      await userEvent.click(document.body);
      expect(mockOnRename).toHaveBeenCalledWith("my-mcp", "blurred-name");
    });

    it("pressing Enter with empty name shows toast.error and does not call onRename", async () => {
      const mockOnRename = vi.fn();
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.keyboard("{Enter}");
      expect(vi.mocked(toast.error)).toHaveBeenCalled();
      expect(mockOnRename).not.toHaveBeenCalled();
    });

    it("pressing Enter with invalid characters shows toast.error and does not call onRename", async () => {
      const mockOnRename = vi.fn();
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "bad name");
      await userEvent.keyboard("{Enter}");
      expect(vi.mocked(toast.error)).toHaveBeenCalled();
      expect(mockOnRename).not.toHaveBeenCalled();
    });

    it("pressing Enter with a name that already exists shows toast.error and does not call onRename", async () => {
      const mockOnRename = vi.fn();
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp", "other-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "other-mcp");
      await userEvent.keyboard("{Enter}");
      expect(vi.mocked(toast.error)).toHaveBeenCalled();
      expect(mockOnRename).not.toHaveBeenCalled();
    });

    it("confirming the same name cancels silently without calling onRename", async () => {
      const mockOnRename = vi.fn();
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      await userEvent.keyboard("{Enter}");
      expect(mockOnRename).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("when onRename throws, editing stays open for retry and original name is NOT shown", async () => {
      // F5: editing stays open on backend error so the user can correct and retry
      // F10: the original name in the code element is not visible (input is shown instead)
      const mockOnRename = vi.fn().mockRejectedValue(new Error("backend error"));
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onRename={mockOnRename} existingNames={["my-mcp"]} />
      );
      await userEvent.dblClick(screen.getByText("my-mcp"));
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "new-name");
      await userEvent.keyboard("{Enter}");
      expect(mockOnRename).toHaveBeenCalledWith("my-mcp", "new-name");
      // Editing remains open — input is still visible, code element is not
      expect(screen.getByRole("textbox")).not.toBeNull();
      expect(screen.queryByText("my-mcp")).toBeNull();
    });
  });

  describe("inline description editing", () => {
    it("shows description text when config._description is set", () => {
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [], _description: "My description" }} tool="code" enabled={true} />
      );
      expect(screen.getByText("My description")).not.toBeNull();
    });

    it('shows "Add description…" placeholder when no description and onDescriptionChange provided', () => {
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onDescriptionChange={vi.fn()} />
      );
      expect(screen.getByText("Add description…")).not.toBeNull();
    });

    it("shows nothing when no description and onDescriptionChange not provided", () => {
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true} />
      );
      expect(screen.queryByText("Add description…")).toBeNull();
    });

    it("clicking description span activates editing when onDescriptionChange is provided", async () => {
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onDescriptionChange={vi.fn()} />
      );
      await userEvent.click(screen.getByText("Add description…"));
      expect(screen.getByRole("textbox", { name: "Description for my-server" })).not.toBeNull();
    });

    it("clicking description span does NOT activate editing when onDescriptionChange is not provided", async () => {
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [], _description: "Some desc" }} tool="code" enabled={true} />
      );
      await userEvent.click(screen.getByText("Some desc"));
      expect(screen.queryByRole("textbox", { name: "Description for my-server" })).toBeNull();
    });

    it("typing description and pressing Enter calls onDescriptionChange with name and trimmed value", async () => {
      const mockOnDescriptionChange = vi.fn().mockResolvedValue(undefined);
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onDescriptionChange={mockOnDescriptionChange} />
      );
      await userEvent.click(screen.getByText("Add description…"));
      const input = screen.getByRole("textbox", { name: "Description for my-server" });
      await userEvent.type(input, "My description");
      await userEvent.keyboard("{Enter}");
      expect(mockOnDescriptionChange).toHaveBeenCalledWith("my-server", "My description");
    });

    it("pressing Enter with empty string calls onDescriptionChange with null", async () => {
      const mockOnDescriptionChange = vi.fn().mockResolvedValue(undefined);
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [], _description: "Old desc" }} tool="code" enabled={true}
          onDescriptionChange={mockOnDescriptionChange} />
      );
      await userEvent.click(screen.getByText("Old desc"));
      const input = screen.getByRole("textbox", { name: "Description for my-server" });
      await userEvent.clear(input);
      await userEvent.keyboard("{Enter}");
      expect(mockOnDescriptionChange).toHaveBeenCalledWith("my-server", null);
    });

    it("pressing Escape cancels without calling onDescriptionChange", async () => {
      const mockOnDescriptionChange = vi.fn();
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onDescriptionChange={mockOnDescriptionChange} />
      );
      await userEvent.click(screen.getByText("Add description…"));
      const input = screen.getByRole("textbox", { name: "Description for my-server" });
      await userEvent.type(input, "Some text");
      await userEvent.keyboard("{Escape}");
      expect(mockOnDescriptionChange).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox", { name: "Description for my-server" })).toBeNull();
    });

    it("Escape then blur does NOT call onDescriptionChange (race condition guard)", async () => {
      const mockOnDescriptionChange = vi.fn();
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onDescriptionChange={mockOnDescriptionChange} />
      );
      await userEvent.click(screen.getByText("Add description…"));
      const input = screen.getByRole("textbox", { name: "Description for my-server" });
      await userEvent.type(input, "Some text");
      await userEvent.keyboard("{Escape}");
      await userEvent.click(document.body);
      expect(mockOnDescriptionChange).not.toHaveBeenCalled();
    });

    it("blur commits description", async () => {
      const mockOnDescriptionChange = vi.fn().mockResolvedValue(undefined);
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onDescriptionChange={mockOnDescriptionChange} />
      );
      await userEvent.click(screen.getByText("Add description…"));
      const input = screen.getByRole("textbox", { name: "Description for my-server" });
      await userEvent.type(input, "Blurred desc");
      await userEvent.click(document.body);
      expect(mockOnDescriptionChange).toHaveBeenCalledWith("my-server", "Blurred desc");
    });

    it("when onDescriptionChange throws, editing stays open for retry", async () => {
      const mockOnDescriptionChange = vi.fn().mockRejectedValue(new Error("backend error"));
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onDescriptionChange={mockOnDescriptionChange} />
      );
      await userEvent.click(screen.getByText("Add description…"));
      const input = screen.getByRole("textbox", { name: "Description for my-server" });
      await userEvent.type(input, "Some desc");
      await userEvent.keyboard("{Enter}");
      expect(mockOnDescriptionChange).toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: "Description for my-server" })).not.toBeNull();
    });

    it("description input has aria-label for {name}", async () => {
      render(
        <MCPRow name="my-server" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onDescriptionChange={vi.fn()} />
      );
      await userEvent.click(screen.getByText("Add description…"));
      const input = screen.getByRole("textbox", { name: "Description for my-server" });
      expect(input).not.toBeNull();
      expect(input.getAttribute("aria-label")).toBe("Description for my-server");
    });
  });

  // onCopyToGlobal and onCopyToDesktop button tests
  describe("copy-to-global and copy-to-desktop buttons", () => {
    it("renders onCopyToGlobal button with correct aria-label when prop provided", () => {
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onCopyToGlobal={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Copy my-mcp to Global" })).not.toBeNull();
    });

    it("renders onCopyToDesktop button with correct aria-label when prop provided", () => {
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true}
          onCopyToDesktop={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Copy my-mcp to Claude Desktop" })).not.toBeNull();
    });

    it("does not render onCopyToGlobal button when prop is not provided", () => {
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
      );
      expect(screen.queryByRole("button", { name: "Copy my-mcp to Global" })).toBeNull();
    });

    it("does not render onCopyToDesktop button when prop is not provided", () => {
      render(
        <MCPRow name="my-mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
      );
      expect(screen.queryByRole("button", { name: "Copy my-mcp to Claude Desktop" })).toBeNull();
    });

    it("calls onCopyToGlobal with name and config when button is clicked", async () => {
      const mockCopy = vi.fn().mockResolvedValue(undefined);
      const config = { command: "node", args: ["index.js"] };
      render(
        <MCPRow name="my-mcp" config={config} tool="code" enabled={true} onCopyToGlobal={mockCopy} />
      );
      await userEvent.click(screen.getByRole("button", { name: "Copy my-mcp to Global" }));
      expect(mockCopy).toHaveBeenCalledWith("my-mcp", config);
    });

    it("calls onCopyToDesktop with name and config when button is clicked", async () => {
      const mockCopy = vi.fn().mockResolvedValue(undefined);
      const config = { command: "node", args: ["index.js"] };
      render(
        <MCPRow name="my-mcp" config={config} tool="code" enabled={true} onCopyToDesktop={mockCopy} />
      );
      await userEvent.click(screen.getByRole("button", { name: "Copy my-mcp to Claude Desktop" }));
      expect(mockCopy).toHaveBeenCalledWith("my-mcp", config);
    });
  });

  // Re-sync: useEffect re-syncs optimisticEnabled when enabled prop changes
  it("re-syncs switch state when enabled prop changes from parent", () => {
    const { rerender } = render(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={true} />
    );
    const switchEl = screen.getByRole("switch");
    expect(switchEl.getAttribute("aria-checked")).toBe("true");

    // Simulate parent updating prop (e.g., after store reload confirms disabled)
    rerender(
      <MCPRow name="mcp" config={{ command: "node", args: [] }} tool="code" enabled={false} />
    );
    expect(switchEl.getAttribute("aria-checked")).toBe("false");
  });
});
