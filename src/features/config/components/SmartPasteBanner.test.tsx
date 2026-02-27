import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SmartPasteBanner } from "./SmartPasteBanner";
import { useAppStore } from "@/stores/useAppStore";

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock @/lib/ipc
vi.mock("@/lib/ipc", () => ({
  invokeCommand: vi.fn(),
}));

// Mock useConfigStore — SmartPasteBanner reads codeConfig/desktopConfig for duplicate detection
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: vi.fn(),
}));

import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";

const mockInvoke = vi.mocked(invokeCommand);
const mockUseConfigStore = vi.mocked(useConfigStore);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);

// Attach .getState() to the mock so SmartPasteBanner can call useConfigStore.getState().reloadConfig()
const mockReloadConfig = vi.fn().mockResolvedValue(undefined);
(mockUseConfigStore as unknown as { getState: () => unknown }).getState = vi
  .fn()
  .mockReturnValue({ reloadConfig: mockReloadConfig });

function defaultConfigState(
  overrides: Partial<ReturnType<typeof useConfigStore>> = {}
): ReturnType<typeof useConfigStore> {
  return {
    codeConfig: null,
    desktopConfig: null,
    codeRaw: null,
    desktopRaw: null,
    codeError: null,
    desktopError: null,
    isLoading: false,
    loadConfigs: vi.fn(),
    reloadConfig: vi.fn(),
    setupFileWatcher: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useConfigStore>;
}

function simulatePaste(text: string) {
  const clipboardData = { getData: (_type: string) => text };
  const event = Object.assign(new Event("paste", { bubbles: true }), { clipboardData });
  act(() => { window.dispatchEvent(event); });
}

const validMcpSnippet = JSON.stringify({
  mcpServers: {
    "github-mcp": { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
  },
});

const validMultiMcpSnippet = JSON.stringify({
  mcpServers: {
    "server-a": { command: "node", args: [] },
    "server-b": { command: "python", args: ["-m", "server"] },
  },
});

const invalidMcpSnippet = JSON.stringify({ something: "not an mcp config" });

const validMcpWithEnv = JSON.stringify({
  mcpServers: {
    "my-mcp": { command: "node", args: ["index.js"], env: { GITHUB_TOKEN: "abc123" } },
  },
});

describe("SmartPasteBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ configActiveTool: "code", activeProjectPath: null });
    mockUseConfigStore.mockReturnValue(defaultConfigState());
    mockInvoke.mockResolvedValue(undefined);
    (mockUseConfigStore as unknown as { getState: () => unknown }).getState = vi
      .fn()
      .mockReturnValue({ reloadConfig: mockReloadConfig });
  });

  // --- Default state ---

  it("is not visible by default (no paste event fired)", () => {
    render(<SmartPasteBanner />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // --- Appearance conditions ---

  it("shows modal when valid MCP snippet is pasted", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByText("MCP detected in clipboard")).not.toBeNull();
  });

  it("shows modal when JSON object pasted but not parseable as MCP", () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("does not show modal for non-JSON paste (plain text)", () => {
    render(<SmartPasteBanner />);
    simulatePaste("just some plain text that is not JSON");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show modal for empty paste", () => {
    render(<SmartPasteBanner />);
    simulatePaste("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show modal for JSON that does not start with '{' (e.g., array)", () => {
    render(<SmartPasteBanner />);
    simulatePaste('["a","b"]');
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // --- Dismiss ---

  it("Cancel button hides the modal", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByRole("dialog")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // --- Suppression logic ---

  it("same content pasted after dismiss does not show modal again", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    simulatePaste(validMcpSnippet);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("different content shows modal again after dismiss", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    simulatePaste(validMultiMcpSnippet);
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("Escape dismisses the current snippet when new paste occurred without prior dismissal", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);     // paste A
    simulatePaste(validMultiMcpSnippet); // paste B (replaces modal content)

    await userEvent.keyboard("[Escape]");
    expect(screen.queryByRole("dialog")).toBeNull();

    // B should be suppressed
    simulatePaste(validMultiMcpSnippet);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // --- Modal content is always visible (no Review toggle needed) ---

  it("MCP name is visible immediately after paste (no Review click needed)", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByText("github-mcp")).not.toBeNull();
  });

  it("shows parsed MCP name, command, args in modal", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByText("github-mcp")).not.toBeNull();
    expect(screen.getByText("npx")).not.toBeNull();
    expect(screen.getByText("-y @modelcontextprotocol/server-github")).not.toBeNull();
  });

  it("shows env keys when env is present", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpWithEnv);
    expect(screen.getByText(/GITHUB_TOKEN/)).not.toBeNull();
  });

  it("lists each MCP separately for multi-MCP snippet", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMultiMcpSnippet);
    expect(screen.getByText("server-a")).not.toBeNull();
    expect(screen.getByText("server-b")).not.toBeNull();
  });

  it("shows 'Could not parse' description for invalid snippet", () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);
    expect(
      screen.getByText("The clipboard content could not be parsed as an MCP config.")
    ).not.toBeNull();
  });

  it("shows raw content for invalid snippet", () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);
    expect(screen.getByText(invalidMcpSnippet)).not.toBeNull();
  });

  // --- Open in Editor ---

  it("Open in Editor button is shown for invalid snippet and navigates to /editor", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Open in Editor" }));
    expect(mockNavigate).toHaveBeenCalledWith("/editor");
  });

  // --- Target selector ---

  it("target selector defaults to Claude Code when active tab is code", () => {
    useAppStore.setState({ configActiveTool: "code", activeProjectPath: null });
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);

    const codeBtn = screen.getByRole("button", { name: "Claude Code" });
    expect(codeBtn.className).toContain("border-amber-500");
  });

  it("target selector defaults to Claude Desktop when active tab is desktop", () => {
    useAppStore.setState({ configActiveTool: "desktop", activeProjectPath: null });
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);

    const desktopBtn = screen.getByRole("button", { name: "Claude Desktop" });
    expect(desktopBtn.className).toContain("border-amber-500");
  });

  it("target selector shows Claude Code, Claude Desktop, and Both options", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);

    expect(screen.getByRole("button", { name: "Claude Code" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Claude Desktop" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Both" })).not.toBeNull();
  });

  it("clicking Claude Desktop changes selected target", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Claude Desktop" }));

    expect(screen.getByRole("button", { name: "Claude Desktop" }).className).toContain("border-amber-500");
  });

  it("clicking Both changes selected target", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Both" }));

    expect(screen.getByRole("button", { name: "Both" }).className).toContain("border-amber-500");
  });

  it("target selector is not shown for invalid (unparseable) snippets", () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);

    expect(screen.queryByRole("button", { name: "Claude Code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Both" })).toBeNull();
  });

  // --- Add MCP ---

  it("Add MCP button is visible for valid MCP", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByRole("button", { name: "Add MCP" })).not.toBeNull();
  });

  it("clicking Add MCP calls invokeCommand with correct args for code target", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", {
      name: "github-mcp",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: null,
      tool: "code",
    });
  });

  it("clicking Add MCP with desktop target calls invokeCommand with tool='desktop'", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Claude Desktop" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", expect.objectContaining({
      tool: "desktop",
    }));
  });

  it("clicking Add MCP with Both target calls invokeCommand twice", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Both" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", expect.objectContaining({ tool: "code" }));
    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", expect.objectContaining({ tool: "desktop" }));
  });

  it("success toast shown after successful add", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("github-mcp"),
      expect.objectContaining({ duration: 3000 })
    );
  });

  it("modal is dismissed after successful add", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("error toast shown on invokeCommand failure", async () => {
    mockInvoke.mockRejectedValue({ message: "Write failed" });

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("Write failed"),
      expect.objectContaining({ duration: Infinity })
    );
  });

  it("modal stays open on invokeCommand failure", async () => {
    mockInvoke.mockRejectedValue({ message: "Write failed" });

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  // --- Duplicate detection ---

  it("shows duplicate warning when MCP name exists in code config", async () => {
    mockUseConfigStore.mockReturnValue(
      defaultConfigState({
        codeConfig: { mcpServers: { "github-mcp": { command: "node", args: [] } } },
      })
    );

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.getByText(/already exists/)).not.toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("shows duplicate warning when MCP name exists in desktop config for desktop target", async () => {
    mockUseConfigStore.mockReturnValue(
      defaultConfigState({
        desktopConfig: { mcpServers: { "github-mcp": { command: "node", args: [] } } },
      })
    );

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Claude Desktop" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.getByText(/already exists/)).not.toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("no duplicate warning when target is code but only desktop has the name", async () => {
    mockUseConfigStore.mockReturnValue(
      defaultConfigState({
        desktopConfig: { mcpServers: { "github-mcp": { command: "node", args: [] } } },
      })
    );

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.queryByText(/already exists/)).toBeNull();
    expect(mockInvoke).toHaveBeenCalled();
  });

  it("Cancel in duplicate warning clears warning", async () => {
    mockUseConfigStore.mockReturnValue(
      defaultConfigState({
        codeConfig: { mcpServers: { "github-mcp": { command: "node", args: [] } } },
      })
    );

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));
    expect(screen.getByText(/already exists/)).not.toBeNull();

    // Two "Cancel" buttons exist: one inside the duplicate warning, one in DialogFooter.
    // Click the first one (inside the warning) to clear only the warning without closing the modal.
    const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
    await userEvent.click(cancelButtons[0]);
    expect(screen.queryByText(/already exists/)).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("Overwrite in duplicate warning calls invokeCommand and proceeds", async () => {
    mockUseConfigStore.mockReturnValue(
      defaultConfigState({
        codeConfig: { mcpServers: { "github-mcp": { command: "node", args: [] } } },
      })
    );

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));
    await userEvent.click(screen.getByRole("button", { name: "Overwrite" }));

    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", expect.objectContaining({
      name: "github-mcp",
    }));
  });

  // --- reloadConfig ---

  it("reloadConfig is called with the correct tool after successful install", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });

  it("reloadConfig is called twice (once per tool) when target is Both", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Both" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockReloadConfig).toHaveBeenCalledTimes(2);
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
    expect(mockReloadConfig).toHaveBeenCalledWith("desktop");
  });

  // --- env field ---

  it("env field is passed to invokeCommand when MCP has env vars", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpWithEnv);
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockInvoke).toHaveBeenCalledWith(
      "mcp_add_from_snippet",
      expect.objectContaining({ env: { GITHUB_TOKEN: "abc123" } })
    );
  });
});
