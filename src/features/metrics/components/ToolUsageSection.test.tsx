import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolUsageSection } from "./ToolUsageSection";

describe("ToolUsageSection", () => {
  it("renders nothing when toolUsage is empty", () => {
    const { container } = render(<ToolUsageSection toolUsage={{}} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders top-10 bars sorted by count desc", () => {
    const toolUsage: Record<string, number> = {
      Read: 100,
      Bash: 80,
      Edit: 60,
      Grep: 40,
      Glob: 30,
      Write: 20,
      Agent: 15,
      WebFetch: 10,
      WebSearch: 8,
      NotebookEdit: 5,
      AskUserQuestion: 2,
    };
    render(<ToolUsageSection toolUsage={toolUsage} />);

    expect(screen.getByText("Read")).not.toBeNull();
    expect(screen.getByText("100")).not.toBeNull();
    expect(screen.getByText("Bash")).not.toBeNull();
    expect(screen.getByText("80")).not.toBeNull();
    expect(screen.getByText("NotebookEdit")).not.toBeNull();
    expect(screen.getByText("5")).not.toBeNull();
  });

  it("groups correctly: builtin vs MCP vs other", async () => {
    const user = userEvent.setup();
    const toolUsage: Record<string, number> = {
      Read: 50,
      Bash: 30,
      mcp__chrome_devtools__click: 10,
      mcp__mysql__query: 5,
      TaskCreate: 8,
      TaskUpdate: 4,
    };
    render(<ToolUsageSection toolUsage={toolUsage} />);

    expect(screen.getByText("Built-in Tools")).not.toBeNull();
    expect(screen.getByText("MCP Tools")).not.toBeNull();
    expect(screen.getByText("Other")).not.toBeNull();

    // Expand Built-in group
    await user.click(screen.getByText("Built-in Tools"));
    expect(screen.getAllByText("Read").length).toBeGreaterThanOrEqual(1);
  });

  it("expands and collapses groups", async () => {
    const user = userEvent.setup();
    const toolUsage = { Read: 10, mcp__x__y: 5 };
    render(<ToolUsageSection toolUsage={toolUsage} />);

    // Expand MCP group
    await user.click(screen.getByText("MCP Tools"));
    // "x / y" appears in both top-10 bar and expanded group
    expect(screen.getAllByText("x / y").length).toBe(2);

    // Collapse MCP group
    await user.click(screen.getByText("MCP Tools"));
    // Only the top-10 bar remains
    expect(screen.getAllByText("x / y").length).toBe(1);
  });

  it("formats MCP names correctly", async () => {
    const user = userEvent.setup();
    const toolUsage = { mcp__chrome_devtools__click: 10 };
    render(<ToolUsageSection toolUsage={toolUsage} />);

    await user.click(screen.getByText("MCP Tools"));
    // Appears in top-10 bar + expanded group
    expect(screen.getAllByText("chrome_devtools / click").length).toBe(2);
  });

  it("shows search filter when > 15 unique tools", () => {
    const toolUsage: Record<string, number> = {};
    for (let i = 0; i < 16; i++) {
      toolUsage[`tool_${i}`] = i + 1;
    }
    render(<ToolUsageSection toolUsage={toolUsage} />);
    expect(screen.getByPlaceholderText("Search tools...")).not.toBeNull();
  });

  it("does not show search filter when <= 15 unique tools", () => {
    const toolUsage = { Read: 10, Bash: 5 };
    render(<ToolUsageSection toolUsage={toolUsage} />);
    expect(screen.queryByPlaceholderText("Search tools...")).toBeNull();
  });

  it("filters results via search", async () => {
    const user = userEvent.setup();
    const toolUsage: Record<string, number> = {};
    for (let i = 0; i < 16; i++) {
      toolUsage[`tool_${i}`] = i + 1;
    }
    toolUsage["Read"] = 100;
    render(<ToolUsageSection toolUsage={toolUsage} />);

    const input = screen.getByPlaceholderText("Search tools...");
    await user.type(input, "Read");

    // Only Built-in group should remain
    expect(screen.getByText("Built-in Tools")).not.toBeNull();
    // "Other" group should be hidden (no matching items)
    expect(screen.queryByText("Other")).toBeNull();
  });

  it("shows Skill callout only when Skill key exists", () => {
    const { rerender } = render(<ToolUsageSection toolUsage={{ Read: 10 }} />);
    expect(screen.queryByText(/Skills invoked/)).toBeNull();

    rerender(<ToolUsageSection toolUsage={{ Read: 10, Skill: 3 }} />);
    expect(screen.getByText(/Skills invoked: 3 times/)).not.toBeNull();
  });

  it("shows singular 'time' for Skill count of 1", () => {
    render(<ToolUsageSection toolUsage={{ Skill: 1 }} />);
    expect(screen.getByText(/Skills invoked: 1 time$/)).not.toBeNull();
  });
});
