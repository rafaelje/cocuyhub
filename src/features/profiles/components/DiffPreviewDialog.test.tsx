import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useProfileStore", () => ({ useProfileStore: vi.fn() }));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: vi.fn() }));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useProfileStore } from "@/stores/useProfileStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { invokeCommand } from "@/lib/ipc";
import { toast } from "sonner";
import { DiffPreviewDialog } from "./DiffPreviewDialog";
import type { ClaudeConfig, Profile } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);
const mockSetActiveProfileId = vi.fn();
const mockReloadConfig = vi.fn().mockResolvedValue(undefined);
const mockOnOpenChange = vi.fn();

const makeProfile = (
  id: string,
  name: string,
  codeMcps: string[] = []
): Profile => ({
  id,
  name,
  mcpServers: {
    code: Object.fromEntries(codeMcps.map((n) => [n, { command: "node", args: [] }])),
    desktop: {},
  },
  createdAt: "2026-01-01T00:00:00Z",
});

const makeConfig = (
  mcps: Record<string, { disabled?: boolean }>
): ClaudeConfig => ({
  mcpServers: Object.fromEntries(
    Object.entries(mcps).map(([name, opts]) => [
      name,
      { command: "node", args: [], disabled: opts.disabled },
    ])
  ),
});

function setupStores(codeConfig: ClaudeConfig | null = null, desktopConfig: ClaudeConfig | null = null) {
  vi.mocked(useConfigStore).mockImplementation((selector) =>
    selector({ codeConfig, desktopConfig } as never)
  );
  vi.mocked(useConfigStore).getState = vi.fn().mockReturnValue({
    reloadConfig: mockReloadConfig,
  });
  vi.mocked(useProfileStore).getState = vi.fn().mockReturnValue({
    setActiveProfileId: mockSetActiveProfileId,
  });
}

describe("DiffPreviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when profile is null", () => {
    setupStores();
    const { container } = render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows 'No changes' message when diff is empty", () => {
    setupStores(makeConfig({ "mcp-a": {} }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    expect(
      screen.getByText("No changes — current state already matches this profile")
    ).not.toBeNull();
  });

  it("shows 'Close' button (not Apply) when no changes", () => {
    setupStores(makeConfig({ "mcp-a": {} }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    // Multiple "Close" exist (our button + Dialog X button); verify at least one visible "Close"
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Apply Profile" })).toBeNull();
  });

  it("shows 'Activating' section with MCP name when MCP is in profile but disabled in config", () => {
    setupStores(makeConfig({ "mcp-a": { disabled: true } }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    expect(screen.getByText("Activating")).not.toBeNull();
    expect(screen.getByText("✓ mcp-a")).not.toBeNull();
  });

  it("shows 'Activating' section when MCP is in profile but absent from config", () => {
    setupStores(makeConfig({}));
    const profile = makeProfile("p1", "Work", ["mcp-new"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    expect(screen.getByText("Activating")).not.toBeNull();
    expect(screen.getByText("✓ mcp-new")).not.toBeNull();
  });

  it("shows 'Deactivating' section with MCP name when MCP is enabled in config but not in profile", () => {
    setupStores(makeConfig({ "mcp-a": {}, "mcp-b": {} }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    expect(screen.getByText("Deactivating")).not.toBeNull();
    expect(screen.getByText("✕ mcp-b")).not.toBeNull();
  });

  it("shows 'Deactivating' for MCPs enabled in desktopConfig but not in profile", () => {
    setupStores(makeConfig({}), makeConfig({ "mcp-desktop": {} }));
    const profile = makeProfile("p1", "Work", []);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    expect(screen.getByText("Deactivating")).not.toBeNull();
    expect(screen.getByText("✕ mcp-desktop")).not.toBeNull();
  });

  it("shows 'A snapshot will be created automatically' subtext", () => {
    setupStores(makeConfig({ "mcp-a": { disabled: true } }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    expect(
      screen.getByText("A snapshot will be created automatically")
    ).not.toBeNull();
  });

  it("clicking [Apply Profile] calls invokeCommand with profile_apply", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    setupStores(makeConfig({ "mcp-a": { disabled: true } }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply Profile" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("profile_apply", {
      profileId: "p1",
    });
  });

  it("on success: calls setActiveProfileId, reloadConfig for both tools, toast.success", async () => {
    mockInvokeCommand.mockResolvedValue(undefined);
    setupStores(makeConfig({ "mcp-a": { disabled: true } }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply Profile" }));
    expect(mockSetActiveProfileId).toHaveBeenCalledWith("p1");
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
    expect(mockReloadConfig).toHaveBeenCalledWith("desktop");
    expect(mockToastSuccess).toHaveBeenCalledWith("Switched to Work", {
      duration: 3000,
    });
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("on error: calls toast.error, does NOT call setActiveProfileId", async () => {
    mockInvokeCommand.mockRejectedValue(new Error("write failed"));
    setupStores(makeConfig({ "mcp-a": { disabled: true } }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply Profile" }));
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to apply profile: write failed",
      { duration: Infinity }
    );
    expect(mockSetActiveProfileId).not.toHaveBeenCalled();
  });

  it("clicking [Cancel] calls onOpenChange(false)", async () => {
    setupStores(makeConfig({ "mcp-a": { disabled: true } }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("Apply Profile button is disabled and shows 'Applying...' while applying", async () => {
    // Use a never-resolving promise to keep isApplying=true
    mockInvokeCommand.mockReturnValue(new Promise(() => {}));
    setupStores(makeConfig({ "mcp-a": { disabled: true } }));
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    render(
      <DiffPreviewDialog open={true} onOpenChange={mockOnOpenChange} profile={profile} />
    );
    const applyBtn = screen.getByRole("button", { name: "Apply Profile" });
    await userEvent.click(applyBtn);
    const applyingBtn = screen.getByRole("button", { name: "Applying..." });
    expect(applyingBtn).not.toBeNull();
    expect((applyingBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
