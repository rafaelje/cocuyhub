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
import { ProjectMcpList } from "./ProjectMcpList";
import type { ClaudeConfig, ProjectConfig } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockReloadConfig = vi.fn().mockResolvedValue(undefined);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);

const PROJECT_PATH = "/Users/rafa/myproject";

const projectConfig: ProjectConfig = {
  mcpServers: {
    "server-a": { command: "node", args: ["a.js"] },
  },
  disabledMcps: {
    "server-b": { command: "python", args: ["b.py"] },
  },
};

const desktopConfig: ClaudeConfig = {
  mcpServers: { "remote-mcp": { command: "python", args: ["-m", "server"] } },
};

describe("ProjectMcpList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConfigStore).getState = vi.fn().mockReturnValue({
      reloadConfig: mockReloadConfig,
    });
    mockInvokeCommand.mockResolvedValue(undefined);
  });

  it("shows empty state when config is null", () => {
    render(<ProjectMcpList config={null} projectPath={PROJECT_PATH} desktopConfig={null} />);
    expect(
      screen.getByText("No MCPs configured. Paste a config to add one.")
    ).not.toBeNull();
  });

  it("shows empty state when config is empty", () => {
    render(
      <ProjectMcpList
        config={{ mcpServers: {}, disabledMcps: {} }}
        projectPath={PROJECT_PATH}
        desktopConfig={null}
      />
    );
    expect(
      screen.getByText("No MCPs configured. Paste a config to add one.")
    ).not.toBeNull();
  });

  it("renders one MCPRow per MCP", () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    expect(screen.getByText("server-a")).not.toBeNull();
    expect(screen.getByText("server-b")).not.toBeNull();
  });

  it("calls project_mcp_toggle with correct args and reloads config", async () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    const switches = screen.getAllByRole("switch");
    // server-a is enabled (first alphabetically), server-b is disabled
    const enabledSwitch = switches.find(
      (s) => s.getAttribute("aria-label") === "Enable server-a in Claude Code"
    );
    expect(enabledSwitch).not.toBeNull();
    await userEvent.click(enabledSwitch!);
    expect(mockInvokeCommand).toHaveBeenCalledWith("project_mcp_toggle", {
      name: "server-a",
      enabled: false,
      projectPath: PROJECT_PATH,
    });
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("server-a"),
      expect.any(Object)
    );
  });

  it("calls project_mcp_delete with correct args and reloads config", async () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove server-a from Claude Code" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("project_mcp_delete", {
      name: "server-a",
      projectPath: PROJECT_PATH,
    });
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("server-a"),
      expect.any(Object)
    );
  });

  it("calls project_mcp_rename with correct args and reloads config", async () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    await userEvent.dblClick(screen.getByText("server-a"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "renamed-mcp");
    await userEvent.keyboard("{Enter}");
    expect(mockInvokeCommand).toHaveBeenCalledWith("project_mcp_rename", {
      oldName: "server-a",
      newName: "renamed-mcp",
      projectPath: PROJECT_PATH,
    });
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });

  it("calls project_mcp_set_description with correct args and reloads config", async () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    await userEvent.click(screen.getByLabelText("Add description for server-a"));
    const input = screen.getByRole("textbox", { name: "Description for server-a" });
    await userEvent.type(input, "My description");
    await userEvent.keyboard("{Enter}");
    expect(mockInvokeCommand).toHaveBeenCalledWith("project_mcp_set_description", {
      name: "server-a",
      description: "My description",
      projectPath: PROJECT_PATH,
    });
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });

  it("calls mcp_add_from_snippet with tool=code for copy-to-global and reloads code config", async () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Copy server-a to Global" })
    );
    expect(mockInvokeCommand).toHaveBeenCalledWith("mcp_add_from_snippet", {
      name: "server-a",
      command: "node",
      args: ["a.js"],
      env: undefined,
      tool: "code",
    });
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("server-a"),
      expect.any(Object)
    );
  });

  it("shows copy-to-desktop button when desktopConfig is provided", () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={desktopConfig} />
    );
    expect(
      screen.getByRole("button", { name: "Copy server-a to Claude Desktop" })
    ).not.toBeNull();
  });

  it("hides copy-to-desktop button when desktopConfig is null", () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    expect(
      screen.queryByRole("button", { name: "Copy server-a to Claude Desktop" })
    ).toBeNull();
  });

  it("calls mcp_add_from_snippet with tool=desktop for copy-to-desktop and reloads desktop config", async () => {
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={desktopConfig} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Copy server-a to Claude Desktop" })
    );
    expect(mockInvokeCommand).toHaveBeenCalledWith("mcp_add_from_snippet", {
      name: "server-a",
      command: "node",
      args: ["a.js"],
      env: undefined,
      tool: "desktop",
    });
    expect(mockReloadConfig).toHaveBeenCalledWith("desktop");
  });

  it("shows toast.error and does not rethrow when toggle fails", async () => {
    mockInvokeCommand.mockRejectedValueOnce({ message: "toggle failed" });
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    const enabledSwitch = screen.getByRole("switch", {
      name: "Enable server-a in Claude Code",
    });
    await userEvent.click(enabledSwitch);
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("toggle failed"),
      expect.any(Object)
    );
  });

  it("shows toast.error when delete fails", async () => {
    mockInvokeCommand.mockRejectedValueOnce({ message: "delete failed" });
    render(
      <ProjectMcpList config={projectConfig} projectPath={PROJECT_PATH} desktopConfig={null} />
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove server-a from Claude Code" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("delete failed"),
      expect.any(Object)
    );
  });
});
