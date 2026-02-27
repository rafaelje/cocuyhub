import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock dependencies used transitively by CopyConfigDialog
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: vi.fn(),
}));

import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { CopyConfigButton } from "./CopyConfigButton";

const mockUseConfigStore = vi.mocked(useConfigStore);

function setup() {
  (mockUseConfigStore as unknown as { getState: () => unknown }).getState = vi
    .fn()
    .mockReturnValue({ reloadConfig: vi.fn().mockResolvedValue(undefined) });
}

describe("CopyConfigButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invokeCommand).mockResolvedValue(undefined);
    setup();
  });

  // Visibility

  it("returns null when hidden=true", () => {
    const { container } = render(
      <CopyConfigButton source="code" destination="desktop" hidden={true} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders button when hidden=false", () => {
    render(<CopyConfigButton source="code" destination="desktop" hidden={false} />);
    expect(screen.getByRole("button", { name: "Copy to Claude Desktop" })).not.toBeNull();
  });

  it("renders 'Copy to Claude Code' label for desktop→code direction", () => {
    render(<CopyConfigButton source="desktop" destination="code" hidden={false} />);
    expect(screen.getByRole("button", { name: "Copy to Claude Code" })).not.toBeNull();
  });

  // Dialog interaction

  it("clicking button opens the confirmation dialog", async () => {
    render(<CopyConfigButton source="code" destination="desktop" hidden={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy to Claude Desktop" }));
    expect(screen.getByText("Copy MCP Configuration")).not.toBeNull();
  });

  it("dialog is not open by default", () => {
    render(<CopyConfigButton source="code" destination="desktop" hidden={false} />);
    expect(screen.queryByText("Copy MCP Configuration")).toBeNull();
  });

  it("clicking Cancel closes the dialog", async () => {
    render(<CopyConfigButton source="code" destination="desktop" hidden={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy to Claude Desktop" }));
    expect(screen.getByText("Copy MCP Configuration")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Copy MCP Configuration")).toBeNull();
  });
});
