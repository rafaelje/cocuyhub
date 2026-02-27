import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock ipc, sonner, and useConfigStore
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: vi.fn(),
}));

import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { CopyConfigDialog } from "./CopyConfigDialog";

const mockInvoke = vi.mocked(invokeCommand);
const mockUseConfigStore = vi.mocked(useConfigStore);
const mockToastSuccess = vi.mocked(toast.success);
const mockToastError = vi.mocked(toast.error);
const mockOnOpenChange = vi.fn();

function setup() {
  (mockUseConfigStore as unknown as { getState: () => unknown }).getState = vi
    .fn()
    .mockReturnValue({ reloadConfig: vi.fn().mockResolvedValue(undefined) });
}

describe("CopyConfigDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    setup();
  });

  it("renders dialog title and description when open", () => {
    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );
    expect(screen.getByText("Copy MCP Configuration")).not.toBeNull();
    expect(screen.getByText(/Claude Code to Claude Desktop/)).not.toBeNull();
    expect(screen.getByText(/snapshot will be created first/)).not.toBeNull();
  });

  it("does not render when closed", () => {
    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={false}
        onOpenChange={mockOnOpenChange}
      />
    );
    expect(screen.queryByText("Copy MCP Configuration")).toBeNull();
  });

  it("renders description for desktop → code direction", () => {
    render(
      <CopyConfigDialog
        source="desktop"
        destination="code"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );
    expect(screen.getByText(/Claude Desktop to Claude Code/)).not.toBeNull();
  });

  it("Cancel button calls onOpenChange(false)", async () => {
    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("Copy button calls invokeCommand with source and destination", async () => {
    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(mockInvoke).toHaveBeenCalledWith("copy_config", {
      source: "code",
      destination: "desktop",
    });
  });

  it("shows success toast and closes dialog on success", async () => {
    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Config copied from Claude Code to Claude Desktop",
      expect.objectContaining({ duration: 3000 })
    );
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls reloadConfig for destination after successful copy", async () => {
    const mockReload = vi.fn().mockResolvedValue(undefined);
    (mockUseConfigStore as unknown as { getState: () => unknown }).getState = vi
      .fn()
      .mockReturnValue({ reloadConfig: mockReload });

    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(mockReload).toHaveBeenCalledWith("desktop");
  });

  it("shows error toast and closes dialog on failure", async () => {
    mockInvoke.mockRejectedValue({ message: "Write failed" });

    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to copy config: Write failed",
      expect.objectContaining({ duration: Infinity })
    );
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("Copy button shows 'Copying...' text while in progress", async () => {
    // Make invoke hang so we can check intermediate state
    let resolve: () => void;
    mockInvoke.mockReturnValue(
      new Promise<void>((res) => {
        resolve = res;
      })
    );

    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    // Click without awaiting to capture intermediate state
    const user = userEvent.setup();
    user.click(screen.getByRole("button", { name: "Copy" }));

    // Wait for "Copying..." to appear
    await screen.findByRole("button", { name: "Copying..." });
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();

    // Resolve the promise to clean up
    resolve!();
  });

  it("Copy and Cancel buttons are disabled while copying", async () => {
    let resolve: () => void;
    mockInvoke.mockReturnValue(
      new Promise<void>((res) => {
        resolve = res;
      })
    );

    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const user = userEvent.setup();
    user.click(screen.getByRole("button", { name: "Copy" }));

    // Wait for copying state
    await screen.findByRole("button", { name: "Copying..." });

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toHaveProperty("disabled", true);

    resolve!();
  });

  it("success toast uses correct labels for desktop → code direction", async () => {
    render(
      <CopyConfigDialog
        source="desktop"
        destination="code"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Config copied from Claude Desktop to Claude Code",
      expect.objectContaining({ duration: 3000 })
    );
  });

  it("Escape key is blocked while copying (handleOpenChange guard)", async () => {
    let resolve: () => void;
    mockInvoke.mockReturnValue(
      new Promise<void>((res) => {
        resolve = res;
      })
    );

    render(
      <CopyConfigDialog
        source="code"
        destination="desktop"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const user = userEvent.setup();
    user.click(screen.getByRole("button", { name: "Copy" }));

    // Wait for copying state
    await screen.findByRole("button", { name: "Copying..." });

    // Escape should NOT close the dialog (onOpenChange not called yet)
    await user.keyboard("{Escape}");
    // onOpenChange should not have been called during copy
    expect(mockOnOpenChange).not.toHaveBeenCalled();

    resolve!();
  });
});
