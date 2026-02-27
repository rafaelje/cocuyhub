import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Tauri APIs (transitively imported by stores)
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock ipc and sonner
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useAppStore } from "@/stores/useAppStore";
import { UpdateNotificationBanner } from "./UpdateNotificationBanner";

const mockInvoke = vi.mocked(invokeCommand);
const mockToastError = vi.mocked(toast.error);

describe("UpdateNotificationBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    // Reset relevant store state
    useAppStore.setState({
      updateVersion: null,
      downloadProgress: null,
      updateReady: false,
    });
  });

  it("returns null when updateVersion is null", () => {
    useAppStore.setState({ updateVersion: null });
    render(<UpdateNotificationBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows banner with correct version text when update is available", () => {
    useAppStore.setState({ updateVersion: "1.2.3" });
    render(<UpdateNotificationBanner />);
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("Update available: v1.2.3")).not.toBeNull();
  });

  it("shows both Install Now and Later buttons when banner is visible", () => {
    useAppStore.setState({ updateVersion: "2.0.0" });
    render(<UpdateNotificationBanner />);
    expect(screen.getByRole("button", { name: "Install Now" })).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Dismiss update notification" })
    ).not.toBeNull();
  });

  it("[Later] button dismisses the banner", async () => {
    useAppStore.setState({ updateVersion: "1.2.3" });
    render(<UpdateNotificationBanner />);
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss update notification" })
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("banner has role='alert' and aria-live='polite' for accessibility", () => {
    useAppStore.setState({ updateVersion: "3.0.0" });
    render(<UpdateNotificationBanner />);
    const alert = screen.getByRole("alert");
    expect(alert).not.toBeNull();
    expect(alert.getAttribute("aria-live")).toBe("polite");
  });

  it("banner displays the exact version string from store", () => {
    useAppStore.setState({ updateVersion: "10.5.2" });
    render(<UpdateNotificationBanner />);
    expect(screen.getByText("Update available: v10.5.2")).not.toBeNull();
  });

  it("banner shows 'Later' as visible button text", () => {
    useAppStore.setState({ updateVersion: "1.2.3" });
    render(<UpdateNotificationBanner />);
    expect(screen.getByText("Later")).not.toBeNull();
  });

  it("banner disappears when updateVersion is set to null in store", () => {
    useAppStore.setState({ updateVersion: "1.0.0" });
    const { rerender } = render(<UpdateNotificationBanner />);
    expect(screen.getByRole("alert")).not.toBeNull();

    useAppStore.setState({ updateVersion: null });
    rerender(<UpdateNotificationBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Download phase tests (Story 7.3)
  it("[Install Now] click calls invokeCommand('download_and_install_update')", async () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: null });
    render(<UpdateNotificationBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Install Now" }));
    expect(mockInvoke).toHaveBeenCalledWith("download_and_install_update");
  });

  it("shows 'Downloading update… N%' text when downloadProgress is not null", () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: 42 });
    render(<UpdateNotificationBanner />);
    expect(screen.getByText("Downloading update… 42%")).not.toBeNull();
  });

  it("hides Install Now and Later buttons while downloading", () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: 10 });
    render(<UpdateNotificationBanner />);
    expect(screen.queryByRole("button", { name: "Install Now" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Dismiss update notification" })
    ).toBeNull();
  });

  it("shows progress text at 0% when download just started", () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: 0 });
    render(<UpdateNotificationBanner />);
    expect(screen.getByText("Downloading update… 0%")).not.toBeNull();
  });

  it("shows progress text at 100% when download almost complete", () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: 100 });
    render(<UpdateNotificationBanner />);
    expect(screen.getByText("Downloading update… 100%")).not.toBeNull();
  });

  it("shows error toast with Retry action on download failure", async () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: null });
    mockInvoke.mockRejectedValue({ message: "Network error" });
    render(<UpdateNotificationBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Install Now" }));
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to download update: Network error",
      expect.objectContaining({
        duration: Infinity,
        action: expect.objectContaining({ label: "Retry" }),
      })
    );
  });

  it("clears downloadProgress after successful download", async () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: null });
    mockInvoke.mockResolvedValue(undefined);
    render(<UpdateNotificationBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Install Now" }));
    expect(useAppStore.getState().downloadProgress).toBeNull();
  });

  it("sets updateReady=true after successful download", async () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: null });
    mockInvoke.mockResolvedValue(undefined);
    render(<UpdateNotificationBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Install Now" }));
    expect(useAppStore.getState().updateReady).toBe(true);
  });

  it("clears downloadProgress on download failure", async () => {
    useAppStore.setState({ updateVersion: "1.0.0", downloadProgress: null });
    mockInvoke.mockRejectedValue({ message: "Network error" });
    render(<UpdateNotificationBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Install Now" }));
    expect(useAppStore.getState().downloadProgress).toBeNull();
  });

  it("banner hidden when updateReady is true (prevents double-install)", () => {
    useAppStore.setState({ updateVersion: "1.0.0", updateReady: true });
    render(<UpdateNotificationBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
