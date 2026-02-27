import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/stores/useAppStore", () => ({
  useAppStore: vi.fn(),
}));

import { useAppStore } from "@/stores/useAppStore";
import { ProcessWarningBanner } from "./ProcessWarningBanner";

const mockUseAppStore = vi.mocked(useAppStore);

function mockProcessStatus(code: boolean, desktop: boolean) {
  mockUseAppStore.mockImplementation((selector) => {
    if (typeof selector === "function") {
      return selector({
        processStatus: { code, desktop },
        sidebarCollapsed: false,
        isLoading: false,
        error: null,
        editorDirty: false,
        externalChangeWarning: false,
        toggleSidebar: vi.fn(),
        setSidebarCollapsed: vi.fn(),
        setProcessStatus: vi.fn(),
        setEditorDirty: vi.fn(),
        setExternalChangeWarning: vi.fn(),
      } as ReturnType<typeof useAppStore>);
    }
    return undefined;
  });
}

describe("ProcessWarningBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when process is not active", () => {
    mockProcessStatus(false, false);
    const { container } = render(<ProcessWarningBanner tool="code" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for desktop tool when desktop not active", () => {
    mockProcessStatus(false, false);
    const { container } = render(<ProcessWarningBanner tool="desktop" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders banner with correct text for code tool", () => {
    mockProcessStatus(true, false);
    render(<ProcessWarningBanner tool="code" />);
    expect(
      screen.getByText("Claude Code is running — changes will apply on next launch")
    ).not.toBeNull();
  });

  it("renders banner with correct text for desktop tool", () => {
    mockProcessStatus(false, true);
    render(<ProcessWarningBanner tool="desktop" />);
    expect(
      screen.getByText("Claude Desktop is running — changes will apply on next launch")
    ).not.toBeNull();
  });

  it("has role='alert' on banner container", () => {
    mockProcessStatus(true, false);
    render(<ProcessWarningBanner tool="code" />);
    expect(screen.getByRole("alert")).not.toBeNull();
  });

  it("has aria-live='polite' on banner container", () => {
    mockProcessStatus(true, false);
    render(<ProcessWarningBanner tool="code" />);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("polite");
  });

  it("renders dismiss button with aria-label", () => {
    mockProcessStatus(true, false);
    render(<ProcessWarningBanner tool="code" />);
    expect(screen.getByRole("button", { name: "Dismiss warning" })).not.toBeNull();
  });

  it("dismisses banner when dismiss button is clicked", async () => {
    mockProcessStatus(true, false);
    render(<ProcessWarningBanner tool="code" />);

    const dismissBtn = screen.getByRole("button", { name: "Dismiss warning" });
    await userEvent.click(dismissBtn);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing for code tool when only desktop is active", () => {
    mockProcessStatus(false, true);
    const { container } = render(<ProcessWarningBanner tool="code" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for desktop tool when only code is active", () => {
    mockProcessStatus(true, false);
    const { container } = render(<ProcessWarningBanner tool="desktop" />);
    expect(container.firstChild).toBeNull();
  });

  it("re-shows banner after dismiss when process becomes active again", async () => {
    // Start with process active → banner visible
    mockProcessStatus(true, false);
    const { rerender } = render(<ProcessWarningBanner tool="code" />);
    expect(screen.getByRole("alert")).not.toBeNull();

    // Dismiss it
    await userEvent.click(screen.getByRole("button", { name: "Dismiss warning" }));
    expect(screen.queryByRole("alert")).toBeNull();

    // Process goes inactive (component re-renders with isActive=false — dismissed doesn't reset here)
    mockProcessStatus(false, false);
    rerender(<ProcessWarningBanner tool="code" />);
    expect(screen.queryByRole("alert")).toBeNull();

    // Process becomes active again → useEffect resets dismissed → banner re-shows
    mockProcessStatus(true, false);
    rerender(<ProcessWarningBanner tool="code" />);
    expect(screen.getByRole("alert")).not.toBeNull();
  });
});
