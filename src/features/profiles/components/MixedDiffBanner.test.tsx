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
vi.mock("./DiffPreviewDialog", () => ({
  DiffPreviewDialog: vi.fn(({ open }: { open: boolean }) =>
    open ? <div data-testid="diff-preview-dialog" /> : null
  ),
}));
vi.mock("./ProfileCreateForm", () => ({
  ProfileCreateForm: vi.fn(({ open }: { open: boolean }) =>
    open ? <div data-testid="profile-create-form" /> : null
  ),
}));

import { useProfileStore } from "@/stores/useProfileStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { MixedDiffBanner } from "./MixedDiffBanner";
import type { ClaudeConfig, Profile } from "@/types";

const makeProfile = (
  id: string,
  name: string,
  activeMcps: string[] = []
): Profile => ({
  id,
  name,
  activeMcps,
  createdAt: "2026-01-01T00:00:00Z",
});

const makeConfig = (
  servers: Record<string, { command?: string; disabled?: boolean }>
): ClaudeConfig => ({
  mcpServers: Object.fromEntries(
    Object.entries(servers).map(([k, v]) => [
      k,
      { command: v.command ?? "node", args: [], ...(v.disabled ? { disabled: true } : {}) },
    ])
  ),
});

function setupStores(
  activeProfileId: string | null,
  profiles: Profile[],
  codeConfig: ClaudeConfig | null
) {
  vi.mocked(useProfileStore).mockImplementation((selector) =>
    selector({ profiles, activeProfileId } as never)
  );
  vi.mocked(useProfileStore).getState = vi.fn().mockReturnValue({
    addProfile: vi.fn(),
  });
  vi.mocked(useConfigStore).mockImplementation((selector) =>
    selector({ codeConfig } as never)
  );
}

describe("MixedDiffBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when activeProfileId is null", () => {
    setupStores(null, [], null);
    const { container } = render(<MixedDiffBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when activeProfileId does not match any profile", () => {
    setupStores("nonexistent-id", [], null);
    const { container } = render(<MixedDiffBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no mixed state (enabled MCPs match profile)", () => {
    const profile = makeProfile("p1", "Work", ["mcp-a"]);
    setupStores("p1", [profile], makeConfig({ "mcp-a": {} }));
    const { container } = render(<MixedDiffBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when profile has no MCPs and no MCPs are enabled", () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({}));
    const { container } = render(<MixedDiffBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows amber 'added' line when MCPs are enabled but not in profile", () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({ "mcp-extra": {} }));
    render(<MixedDiffBanner />);
    expect(screen.getByText(/\+ active vs Work: mcp-extra/)).not.toBeNull();
  });

  it("shows red 'missing' line when profile MCPs are disabled in config", () => {
    const profile = makeProfile("p1", "Work", ["mcp-y"]);
    setupStores(
      "p1",
      [profile],
      makeConfig({ "mcp-y": { disabled: true } })
    );
    render(<MixedDiffBanner />);
    expect(screen.getByText(/- missing vs Work: mcp-y/)).not.toBeNull();
  });

  it("collapse toggle hides the diff content", async () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({ "mcp-x": {} }));
    render(<MixedDiffBanner />);
    // Content visible initially
    expect(screen.getByText(/\+ active vs Work: mcp-x/)).not.toBeNull();
    // Click toggle
    await userEvent.click(screen.getByRole("button", { name: "▾" }));
    // Content hidden
    expect(screen.queryByText(/\+ active vs Work/)).toBeNull();
  });

  it("collapse toggle button has aria-expanded=true when expanded", () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({ "mcp-x": {} }));
    render(<MixedDiffBanner />);
    const toggle = screen.getByRole("button", { name: "▾" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("collapse toggle button has aria-expanded=false when collapsed", async () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({ "mcp-x": {} }));
    render(<MixedDiffBanner />);
    await userEvent.click(screen.getByRole("button", { name: "▾" }));
    const toggle = screen.getByRole("button", { name: "▸" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking Reset button opens DiffPreviewDialog", async () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({ "mcp-x": {} }));
    render(<MixedDiffBanner />);
    await userEvent.click(screen.getByRole("button", { name: /Reset to Work/ }));
    expect(screen.getByTestId("diff-preview-dialog")).not.toBeNull();
  });

  it("clicking 'Save as new profile...' opens ProfileCreateForm", async () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({ "mcp-x": {} }));
    render(<MixedDiffBanner />);
    await userEvent.click(
      screen.getByRole("button", { name: /Save as new profile/ })
    );
    expect(screen.getByTestId("profile-create-form")).not.toBeNull();
  });

  it("wrapper has aria-live='polite'", () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({ "mcp-x": {} }));
    const { container } = render(<MixedDiffBanner />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute("aria-live")).toBe("polite");
  });

  it("shows 'Mixed state' header when mixed", () => {
    const profile = makeProfile("p1", "Work", []);
    setupStores("p1", [profile], makeConfig({ "mcp-x": {} }));
    render(<MixedDiffBanner />);
    expect(screen.getByText("Mixed state")).not.toBeNull();
  });
});
