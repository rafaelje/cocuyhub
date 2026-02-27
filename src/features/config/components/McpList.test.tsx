import { describe, it, expect, vi, beforeEach } from "vitest";

// Radix ScrollArea uses ResizeObserver which is not available in jsdom
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: { getState: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { toast } from "sonner";
import { McpList } from "./McpList";
import type { ClaudeConfig, CommandError } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockReloadConfig = vi.fn().mockResolvedValue(undefined);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);

const twoMcps: ClaudeConfig = {
  mcpServers: {
    "server-a": { command: "node", args: ["a.js"] },
  },
  disabledMcps: {
    "server-b": { command: "python", args: ["b.py"] },
  },
};

const desktopConfigFixture: ClaudeConfig = {
  mcpServers: { "remote-mcp": { command: "python", args: ["-m", "server"] } },
};

describe("McpList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConfigStore).getState = vi.fn().mockReturnValue({
      reloadConfig: mockReloadConfig,
    });
  });

  it("shows empty state when config is null", () => {
    render(<McpList config={null} tool="code" />);
    expect(
      screen.getByText("No MCPs configured. Paste a config to add one.")
    ).not.toBeNull();
  });

  it("shows empty state when mcpServers is empty", () => {
    render(<McpList config={{ mcpServers: {}, disabledMcps: {} }} tool="code" />);
    expect(
      screen.getByText("No MCPs configured. Paste a config to add one.")
    ).not.toBeNull();
  });

  it("renders one MCPRow per server", () => {
    render(<McpList config={twoMcps} tool="code" />);
    expect(screen.getByText("server-a")).not.toBeNull();
    expect(screen.getByText("server-b")).not.toBeNull();
  });

  it("renders the correct number of articles", () => {
    render(<McpList config={twoMcps} tool="code" />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("renders MCPs in alphabetical order regardless of enabled/disabled state", () => {
    const unorderedConfig: ClaudeConfig = {
      mcpServers: { "beta-mcp": { command: "node", args: [] } },
      disabledMcps: { "alpha-mcp": { command: "python", args: [] } },
    };
    render(<McpList config={unorderedConfig} tool="code" />);
    const articles = screen.getAllByRole("article");
    expect(within(articles[0]).getByText("alpha-mcp")).not.toBeNull();
    expect(within(articles[1]).getByText("beta-mcp")).not.toBeNull();
  });

  it("renders MCPs in case-insensitive alphabetical order", () => {
    const mixedCaseConfig: ClaudeConfig = {
      mcpServers: { "Zeta-mcp": { command: "node", args: [] }, "alpha-mcp": { command: "node", args: [] } },
      disabledMcps: { "BETA-mcp": { command: "python", args: [] } },
    };
    render(<McpList config={mixedCaseConfig} tool="code" />);
    const articles = screen.getAllByRole("article");
    expect(within(articles[0]).getByText("alpha-mcp")).not.toBeNull();
    expect(within(articles[1]).getByText("BETA-mcp")).not.toBeNull();
    expect(within(articles[2]).getByText("Zeta-mcp")).not.toBeNull();
  });

  it("deduplicates entries that appear in both mcpServers and disabledMcps (prefers enabled)", () => {
    const duplicateConfig: ClaudeConfig = {
      mcpServers: { "dupe-mcp": { command: "node", args: [] } },
      disabledMcps: { "dupe-mcp": { command: "python", args: [] } },
    };
    render(<McpList config={duplicateConfig} tool="code" />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("shows empty state when config has no mcpServers key", () => {
    const noServersConfig = { disabledMcps: {} } as unknown as ClaudeConfig;
    render(<McpList config={noServersConfig} tool="code" />);
    expect(
      screen.getByText("No MCPs configured. Paste a config to add one.")
    ).not.toBeNull();
  });

  // L2 fix: use aria-label to find specific switches instead of relying on DOM order
  it("passes the correct enabled state to each row", () => {
    render(<McpList config={twoMcps} tool="code" />);
    const serverASwitch = screen.getByRole("switch", {
      name: "Enable server-a in Claude Code",
    });
    const serverBSwitch = screen.getByRole("switch", {
      name: "Enable server-b in Claude Code",
    });
    expect(serverASwitch.getAttribute("aria-checked")).toBe("true");
    expect(serverBSwitch.getAttribute("aria-checked")).toBe("false");
  });

  it("renders ScrollArea wrapper when there are MCPs", () => {
    const { container } = render(<McpList config={twoMcps} tool="code" />);
    expect(container.querySelector("[data-slot='scroll-area']")).not.toBeNull();
  });

  it("passes tool prop to each MCPRow", () => {
    render(<McpList config={twoMcps} tool="desktop" />);
    expect(
      screen.getByRole("switch", { name: "Enable server-a in Claude Desktop" })
    ).not.toBeNull();
  });

  // M3: loading state
  it("shows loading skeleton when isLoading is true", () => {
    const { container } = render(
      <McpList config={null} tool="code" isLoading={true} />
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  it("does not show empty state when isLoading is true", () => {
    render(<McpList config={null} tool="code" isLoading={true} />);
    expect(
      screen.queryByText("No MCPs configured. Paste a config to add one.")
    ).toBeNull();
  });

  // M1: error state
  it("shows error message when error prop is set", () => {
    const err: CommandError = { type: "FileNotFound", path: "/some/path" };
    render(<McpList config={null} tool="code" error={err} />);
    expect(
      screen.getByText("Could not read config file. Check the path in Settings.")
    ).not.toBeNull();
  });

  it("does not show empty state when error prop is set", () => {
    const err: CommandError = { type: "ReadError", message: "permission denied" };
    render(<McpList config={null} tool="code" error={err} />);
    expect(
      screen.queryByText("No MCPs configured. Paste a config to add one.")
    ).toBeNull();
  });

  it("error state takes priority over empty config", () => {
    const err: CommandError = { type: "ParseError", message: "unexpected token" };
    render(<McpList config={{ mcpServers: {} }} tool="code" error={err} />);
    expect(
      screen.getByText("Could not read config file. Check the path in Settings.")
    ).not.toBeNull();
  });

  // Toggle tests (Story 2.3)
  it("calls invokeCommand with mcp_toggle when switch is clicked", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    const serverASwitch = screen.getByRole("switch", {
      name: "Enable server-a in Claude Code",
    });
    await userEvent.click(serverASwitch);
    expect(mockInvokeCommand).toHaveBeenCalledWith("mcp_toggle", {
      name: "server-a",
      enabled: false,
      tool: "code",
    });
  });

  it("calls reloadConfig on successful toggle", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.click(
      screen.getByRole("switch", { name: "Enable server-a in Claude Code" })
    );
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });

  it("calls toast.success on successful toggle", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.click(
      screen.getByRole("switch", { name: "Enable server-a in Claude Code" })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("MCP server-a disabled", { duration: 3000 });
  });

  it("calls toast.error on toggle failure", async () => {
    mockInvokeCommand.mockRejectedValue({ message: "write failed" });
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.click(
      screen.getByRole("switch", { name: "Enable server-a in Claude Code" })
    );
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to toggle MCP: write failed",
      { duration: Infinity }
    );
  });

  // Delete tests (Story 2.5)
  it("calls invokeCommand with mcp_delete when delete confirmed", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove server-a from Claude Code" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("mcp_delete", {
      name: "server-a",
      tool: "code",
    });
  });

  it("calls reloadConfig on successful delete", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove server-a from Claude Code" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });

  it("calls toast.success with MCP name removed on successful delete", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove server-a from Claude Code" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockToastSuccess).toHaveBeenCalledWith("MCP server-a removed", { duration: 3000 });
  });

  it("calls toast.error on delete failure", async () => {
    mockInvokeCommand.mockRejectedValue({ message: "delete failed" });
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove server-a from Claude Code" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to delete MCP: delete failed",
      { duration: Infinity }
    );
  });

  // disabledMcps node tests
  it("shows disabled MCPs from disabledMcps node with switch off", () => {
    render(
      <McpList
        config={{ mcpServers: {}, disabledMcps: { "my-mcp": { command: "node", args: [] } } }}
        tool="code"
      />
    );
    const switchEl = screen.getByRole("switch", { name: "Enable my-mcp in Claude Code" });
    expect(switchEl.getAttribute("aria-checked")).toBe("false");
  });

  it("does NOT show empty state when only disabledMcps has entries", () => {
    render(
      <McpList
        config={{ mcpServers: {}, disabledMcps: { "my-mcp": { command: "node", args: [] } } }}
        tool="code"
      />
    );
    expect(
      screen.queryByText("No MCPs configured. Paste a config to add one.")
    ).toBeNull();
    expect(screen.getByText("my-mcp")).not.toBeNull();
  });

  // Rename tests
  it("calls invokeCommand mcp_rename when rename is confirmed from MCPRow", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.dblClick(screen.getByText("server-a"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "server-z");
    await userEvent.keyboard("{Enter}");
    expect(mockInvokeCommand).toHaveBeenCalledWith("mcp_rename", {
      oldName: "server-a",
      newName: "server-z",
      tool: "code",
    });
  });

  it("calls reloadConfig after successful rename", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.dblClick(screen.getByText("server-a"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "server-z");
    await userEvent.keyboard("{Enter}");
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });

  it("shows toast.success after successful rename", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.dblClick(screen.getByText("server-a"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "server-z");
    await userEvent.keyboard("{Enter}");
    expect(mockToastSuccess).toHaveBeenCalledWith("MCP server-a renamed to server-z", { duration: 3000 });
  });

  it("shows toast.error when mcp_rename invokeCommand fails and keeps editing open", async () => {
    // F5+F12: McpList re-throws; MCPRow keeps editing open for retry
    mockInvokeCommand.mockRejectedValue({ message: "rename failed" });
    render(<McpList config={twoMcps} tool="code" />);
    await userEvent.dblClick(screen.getByText("server-a"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "server-z");
    await userEvent.keyboard("{Enter}");
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to rename MCP: rename failed",
      { duration: Infinity }
    );
    // Editing stays open so the user can retry or press Escape
    expect(screen.getByRole("textbox")).not.toBeNull();
  });

  // Description tests
  it("calls mcp_set_description and reloads config on description change", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" />);
    const articles = screen.getAllByRole("article");
    await userEvent.click(within(articles[0]).getByText("Add description…"));
    const input = screen.getByRole("textbox", { name: "Description for server-a" });
    await userEvent.type(input, "My description");
    await userEvent.keyboard("{Enter}");
    expect(mockInvokeCommand).toHaveBeenCalledWith("mcp_set_description", {
      name: "server-a",
      description: "My description",
      tool: "code",
    });
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });

  it("shows error toast and rethrows when mcp_set_description fails", async () => {
    mockInvokeCommand.mockRejectedValue({ message: "write failed" });
    render(<McpList config={twoMcps} tool="code" />);
    const articles = screen.getAllByRole("article");
    await userEvent.click(within(articles[0]).getByText("Add description…"));
    const input = screen.getByRole("textbox", { name: "Description for server-a" });
    await userEvent.type(input, "My description");
    await userEvent.keyboard("{Enter}");
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to update description: write failed",
      { duration: Infinity }
    );
    expect(screen.getByRole("textbox", { name: "Description for server-a" })).not.toBeNull();
  });

  // copy-to-other tests
  it("passes onCopyToOther to MCPRow when otherConfig is provided", () => {
    render(<McpList config={twoMcps} tool="code" otherConfig={desktopConfigFixture} />);
    expect(
      screen.getByRole("button", { name: "Copy server-a to Claude Desktop" })
    ).not.toBeNull();
  });

  it("does not pass onCopyToOther to MCPRow when otherConfig is null", () => {
    render(<McpList config={twoMcps} tool="code" otherConfig={null} />);
    expect(
      screen.queryByRole("button", { name: "Copy server-a to Claude Desktop" })
    ).toBeNull();
  });

  it("does not pass onCopyToOther when otherConfig is undefined", () => {
    render(<McpList config={twoMcps} tool="code" />);
    expect(
      screen.queryByRole("button", { name: "Copy server-a to Claude Desktop" })
    ).toBeNull();
  });

  it("calls invokeCommand mcp_add_from_snippet on copy-to-other click", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" otherConfig={desktopConfigFixture} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy server-a to Claude Desktop" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("mcp_add_from_snippet", {
      name: "server-a",
      command: "node",
      args: ["a.js"],
      env: undefined,
      tool: "desktop",
    });
  });

  it("calls reloadConfig for other tool on successful copy", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" otherConfig={desktopConfigFixture} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy server-a to Claude Desktop" }));
    expect(mockReloadConfig).toHaveBeenCalledWith("desktop");
  });

  it("shows toast success on successful copy to other tool", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    render(<McpList config={twoMcps} tool="code" otherConfig={desktopConfigFixture} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy server-a to Claude Desktop" }));
    expect(mockToastSuccess).toHaveBeenCalledWith("server-a copied to Claude Desktop", { duration: 3000 });
  });
});
