import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Tauri APIs (transitively imported by stores)
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock ipc
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));

import { invokeCommand } from "@/lib/ipc";
import { useAppStore } from "@/stores/useAppStore";
import { UpdateReadyDialog } from "./UpdateReadyDialog";

const mockInvoke = vi.mocked(invokeCommand);

describe("UpdateReadyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    useAppStore.setState({ updateReady: false, downloadProgress: null });
  });

  it("dialog not shown when updateReady is false", () => {
    useAppStore.setState({ updateReady: false });
    render(<UpdateReadyDialog />);
    expect(screen.queryByText("Update Ready")).toBeNull();
  });

  it("dialog shown when updateReady is true", () => {
    useAppStore.setState({ updateReady: true });
    render(<UpdateReadyDialog />);
    expect(screen.getByText("Update Ready")).not.toBeNull();
  });

  it("shows restart description text", () => {
    useAppStore.setState({ updateReady: true });
    render(<UpdateReadyDialog />);
    expect(
      screen.getByText(/master-panel will restart to apply the update/)
    ).not.toBeNull();
  });

  it("shows Restart Now and Later buttons", () => {
    useAppStore.setState({ updateReady: true });
    render(<UpdateReadyDialog />);
    expect(screen.getByRole("button", { name: "Restart Now" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Later" })).not.toBeNull();
  });

  it("[Later] sets updateReady to false in store", async () => {
    useAppStore.setState({ updateReady: true });
    render(<UpdateReadyDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(useAppStore.getState().updateReady).toBe(false);
  });

  it("[Restart Now] calls invokeCommand('restart_app')", async () => {
    useAppStore.setState({ updateReady: true });
    render(<UpdateReadyDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Restart Now" }));
    expect(mockInvoke).toHaveBeenCalledWith("restart_app");
  });

  it("[Restart Now] shows 'Restarting…' while in progress", async () => {
    useAppStore.setState({ updateReady: true });
    // Make invoke hang so we can check intermediate state
    let resolve: () => void;
    mockInvoke.mockReturnValue(
      new Promise<void>((res) => {
        resolve = res;
      })
    );
    render(<UpdateReadyDialog />);
    const user = userEvent.setup();
    user.click(screen.getByRole("button", { name: "Restart Now" }));
    await screen.findByRole("button", { name: "Restarting…" });
    expect(screen.queryByRole("button", { name: "Restart Now" })).toBeNull();
    resolve!();
  });

  it("[Later] disabled while restarting", async () => {
    useAppStore.setState({ updateReady: true });
    let resolve: () => void;
    mockInvoke.mockReturnValue(
      new Promise<void>((res) => {
        resolve = res;
      })
    );
    render(<UpdateReadyDialog />);
    const user = userEvent.setup();
    user.click(screen.getByRole("button", { name: "Restart Now" }));
    await screen.findByRole("button", { name: "Restarting…" });
    expect(screen.getByRole("button", { name: "Later" })).toHaveProperty(
      "disabled",
      true
    );
    resolve!();
  });

  it("resets updateReady to false when restart_app fails", async () => {
    useAppStore.setState({ updateReady: true });
    mockInvoke.mockRejectedValue(new Error("restart failed"));
    render(<UpdateReadyDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Restart Now" }));
    expect(useAppStore.getState().updateReady).toBe(false);
  });

  it("backdrop/Escape does not close dialog while restarting (updateReady stays true)", async () => {
    useAppStore.setState({ updateReady: true });
    let resolve: () => void;
    mockInvoke.mockReturnValue(
      new Promise<void>((res) => {
        resolve = res;
      })
    );
    render(<UpdateReadyDialog />);
    const user = userEvent.setup();
    user.click(screen.getByRole("button", { name: "Restart Now" }));
    await screen.findByRole("button", { name: "Restarting…" });
    // Simulate pressing Escape
    await user.keyboard("{Escape}");
    expect(useAppStore.getState().updateReady).toBe(true);
    resolve!();
  });
});
