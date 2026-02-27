import { describe, it, expect, vi, beforeEach } from "vitest";

// Radix ScrollArea uses ResizeObserver which is not available in jsdom
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
import { render, screen } from "@testing-library/react";
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
    "server-b": { command: "python", args: ["b.py"], disabled: true },
  },
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
    render(<McpList config={{ mcpServers: {} }} tool="code" />);
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
});
