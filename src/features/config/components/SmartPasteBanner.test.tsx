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

/**
 * Default empty config store state — no MCPs configured.
 */
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

/**
 * Simulate a paste event on the window with given text content.
 */
function simulatePaste(text: string) {
  const clipboardData = {
    getData: (_type: string) => text,
  };
  const event = Object.assign(new Event("paste", { bubbles: true }), {
    clipboardData,
  });
  act(() => {
    window.dispatchEvent(event);
  });
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

const invalidMcpSnippet = JSON.stringify({
  something: "not an mcp config",
});

const validMcpWithEnv = JSON.stringify({
  mcpServers: {
    "my-mcp": {
      command: "node",
      args: ["index.js"],
      env: { GITHUB_TOKEN: "abc123" },
    },
  },
});

describe("SmartPasteBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useAppStore.setState({ configActiveTool: "code" });
    mockUseConfigStore.mockReturnValue(defaultConfigState());
    mockInvoke.mockResolvedValue(undefined);
    // Re-attach getState after clearAllMocks so SmartPasteBanner can call
    // useConfigStore.getState().reloadConfig(). Use module-level mockReloadConfig
    // so tests can assert it was called with the correct args.
    (mockUseConfigStore as unknown as { getState: () => unknown }).getState = vi
      .fn()
      .mockReturnValue({ reloadConfig: mockReloadConfig });
  });

  // --- Default state ---

  it("is not visible by default (no paste event fired)", () => {
    render(<SmartPasteBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // --- Appearance conditions ---

  it("shows banner when valid MCP snippet is pasted", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Clipboard contains an MCP config — Add it?")).not.toBeNull();
  });

  it("shows banner when JSON object pasted but not parseable as MCP", () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);
    expect(screen.getByRole("alert")).not.toBeNull();
  });

  it("does not show banner for non-JSON paste (plain text)", () => {
    render(<SmartPasteBanner />);
    simulatePaste("just some plain text that is not JSON");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not show banner for empty paste", () => {
    render(<SmartPasteBanner />);
    simulatePaste("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not show banner for JSON that does not start with '{' (e.g., array)", () => {
    render(<SmartPasteBanner />);
    simulatePaste('["a","b"]');
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // --- Accessibility ---

  it("banner has role='alert' and aria-live='assertive'", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  // --- Dismiss ---

  it("dismiss button hides the banner", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByRole("alert")).not.toBeNull();

    const dismissBtn = screen.getByRole("button", { name: "Dismiss smart paste banner" });
    await userEvent.click(dismissBtn);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dismiss button has aria-label='Dismiss smart paste banner'", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(
      screen.getByRole("button", { name: "Dismiss smart paste banner" })
    ).not.toBeNull();
  });

  it("Escape key hides the banner", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByRole("alert")).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // --- Suppression logic ---

  it("same content pasted after dismiss does not show banner again", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    expect(screen.getByRole("alert")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss smart paste banner" }));
    expect(screen.queryByRole("alert")).toBeNull();

    // Paste the same content again
    simulatePaste(validMcpSnippet);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("different content shows banner again after dismiss", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss smart paste banner" }));
    expect(screen.queryByRole("alert")).toBeNull();

    // Paste different content
    simulatePaste(validMultiMcpSnippet);
    expect(screen.getByRole("alert")).not.toBeNull();
  });

  it("Escape dismisses the current snippet when new paste occurred without prior dismissal", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);     // paste A
    simulatePaste(validMultiMcpSnippet); // paste B (replaces banner content)

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(screen.queryByRole("alert")).toBeNull();

    // B should be suppressed — pasting B again should NOT show banner
    simulatePaste(validMultiMcpSnippet);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // --- Review panel ---

  it("review panel is hidden by default (before clicking Review)", () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    // Review panel content not visible yet
    expect(screen.queryByText("github-mcp")).toBeNull();
  });

  it("clicking Review toggles the review panel open", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("github-mcp")).not.toBeNull();
  });

  it("clicking Review again toggles review panel closed", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("github-mcp")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.queryByText("github-mcp")).toBeNull();
  });

  it("review panel shows parsed MCP name, command, args", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("github-mcp")).not.toBeNull();
    expect(screen.getByText("npx")).not.toBeNull();
    expect(screen.getByText("-y @modelcontextprotocol/server-github")).not.toBeNull();
  });

  it("review panel shows env keys when env is present", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpWithEnv);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText(/GITHUB_TOKEN/)).not.toBeNull();
  });

  it("review panel lists each MCP separately for multi-MCP snippet", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMultiMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("server-a")).not.toBeNull();
    expect(screen.getByText("server-b")).not.toBeNull();
  });

  it("review panel shows 'Could not parse' for invalid snippet", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("Could not parse as MCP config")).not.toBeNull();
  });

  it("review panel shows raw content for invalid snippet", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText(invalidMcpSnippet)).not.toBeNull();
  });

  // --- Open in Editor ---

  it("Open in Editor button navigates to /editor", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);

    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Open in Editor" }));
    expect(mockNavigate).toHaveBeenCalledWith("/editor");
  });

  // --- Target selector ---

  it("target selector defaults to Claude Code when active tab is code", async () => {
    useAppStore.setState({ configActiveTool: "code" });
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    // Claude Code button should be highlighted (has amber border class)
    const codeBtn = screen.getByRole("button", { name: "Claude Code" });
    expect(codeBtn.className).toContain("border-amber-500");
  });

  it("target selector defaults to Claude Desktop when active tab is desktop", async () => {
    useAppStore.setState({ configActiveTool: "desktop" });
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    const desktopBtn = screen.getByRole("button", { name: "Claude Desktop" });
    expect(desktopBtn.className).toContain("border-amber-500");
  });

  it("target selector shows Claude Code, Claude Desktop, and Both options", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.getByRole("button", { name: "Claude Code" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Claude Desktop" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Both" })).not.toBeNull();
  });

  it("clicking Claude Desktop changes selected target", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    await userEvent.click(screen.getByRole("button", { name: "Claude Desktop" }));

    const desktopBtn = screen.getByRole("button", { name: "Claude Desktop" });
    expect(desktopBtn.className).toContain("border-amber-500");
  });

  it("clicking Both changes selected target", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    await userEvent.click(screen.getByRole("button", { name: "Both" }));

    const bothBtn = screen.getByRole("button", { name: "Both" });
    expect(bothBtn.className).toContain("border-amber-500");
  });

  it("target selector is not shown for invalid (unparseable) snippets", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(invalidMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.queryByRole("button", { name: "Claude Code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Both" })).toBeNull();
  });

  // --- Add MCP ---

  it("Add MCP button is visible in review panel for valid MCP", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.getByRole("button", { name: "Add MCP" })).not.toBeNull();
  });

  it("clicking Add MCP calls invokeCommand with correct args for code target", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Claude Desktop" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", expect.objectContaining({
      tool: "desktop",
    }));
  });

  it("clicking Add MCP with Both target calls invokeCommand twice", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Both" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", expect.objectContaining({ tool: "code" }));
    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", expect.objectContaining({ tool: "desktop" }));
  });

  it("success toast shown after successful add", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("github-mcp"),
      expect.objectContaining({ duration: 3000 })
    );
  });

  it("banner is dismissed after successful add", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("error toast shown on invokeCommand failure", async () => {
    mockInvoke.mockRejectedValue({ message: "Write failed" });

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining("Write failed"),
      expect.objectContaining({ duration: Infinity })
    );
  });

  it("banner stays open on invokeCommand failure", async () => {
    mockInvoke.mockRejectedValue({ message: "Write failed" });

    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.getByRole("alert")).not.toBeNull();
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
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    // Target is "code" (default), desktop has the MCP but code doesn't
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
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.getByText(/already exists/)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(screen.getByText(/already exists/)).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Overwrite" }));

    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_from_snippet", expect.objectContaining({
      name: "github-mcp",
    }));
  });

  // --- reloadConfig ---

  it("reloadConfig is called with the correct tool after successful install", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });

  it("reloadConfig is called twice (once per tool) when target is Both", async () => {
    render(<SmartPasteBanner />);
    simulatePaste(validMcpSnippet);
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Add MCP" }));

    expect(mockInvoke).toHaveBeenCalledWith(
      "mcp_add_from_snippet",
      expect.objectContaining({ env: { GITHUB_TOKEN: "abc123" } })
    );
  });
});
