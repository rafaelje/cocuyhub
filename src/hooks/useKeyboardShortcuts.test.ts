import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useNavigationShortcuts,
  useProfileSwitcherShortcut,
  useSidebarToggle,
  useManualSnapshotShortcut,
} from "./useKeyboardShortcuts";
import { useAppStore } from "@/stores/useAppStore";

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

describe("useNavigationShortcuts", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates to /config on ⌘1", () => {
    renderHook(() => useNavigationShortcuts());

    const event = new KeyboardEvent("keydown", { key: "1", metaKey: true, bubbles: true });
    window.dispatchEvent(event);

    expect(mockNavigate).toHaveBeenCalledWith("/config");
  });

  it("navigates to /editor on ⌘2", () => {
    renderHook(() => useNavigationShortcuts());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", metaKey: true, bubbles: true }));
    expect(mockNavigate).toHaveBeenCalledWith("/editor");
  });

  it("navigates to /profiles on ⌘3", () => {
    renderHook(() => useNavigationShortcuts());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "3", metaKey: true, bubbles: true }));
    expect(mockNavigate).toHaveBeenCalledWith("/profiles");
  });

  it("navigates to /snapshots on ⌘4", () => {
    renderHook(() => useNavigationShortcuts());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "4", metaKey: true, bubbles: true }));
    expect(mockNavigate).toHaveBeenCalledWith("/snapshots");
  });

  it("navigates to /settings on ⌘5", () => {
    renderHook(() => useNavigationShortcuts());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "5", metaKey: true, bubbles: true }));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("navigates to /editor on ⌘E", () => {
    renderHook(() => useNavigationShortcuts());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", metaKey: true, bubbles: true }));
    expect(mockNavigate).toHaveBeenCalledWith("/editor");
  });

  it("does NOT navigate when metaKey is false", () => {
    renderHook(() => useNavigationShortcuts());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", metaKey: false, bubbles: true }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does NOT navigate on 'e' key without metaKey", () => {
    renderHook(() => useNavigationShortcuts());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", metaKey: false, bubbles: true }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("cleans up event listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useNavigationShortcuts());
    const handler = addSpy.mock.calls[0][1];

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", handler);
  });
});

describe("useManualSnapshotShortcut", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useAppStore.setState((state) => ({ ...state, snapshotFormOpen: false }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("⌘⇧S navigates to /snapshots", () => {
    renderHook(() => useManualSnapshotShortcut());
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "S",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith("/snapshots");
  });

  it("⌘⇧S calls setSnapshotFormOpen(true)", () => {
    renderHook(() => useManualSnapshotShortcut());
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "S",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
    expect(useAppStore.getState().snapshotFormOpen).toBe(true);
  });

  it("does NOT trigger when only ⌘S (without Shift)", () => {
    renderHook(() => useManualSnapshotShortcut());
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "S",
        metaKey: true,
        shiftKey: false,
        bubbles: true,
      })
    );
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useAppStore.getState().snapshotFormOpen).toBe(false);
  });

  it("cleans up event listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useManualSnapshotShortcut());
    const handler = addSpy.mock.calls[0][1];

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", handler);
  });
});

describe("useProfileSwitcherShortcut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("⌘P calls onOpen callback", () => {
    const onOpen = vi.fn();
    renderHook(() => useProfileSwitcherShortcut(onOpen));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true })
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("non-⌘P keys do not call onOpen", () => {
    const onOpen = vi.fn();
    renderHook(() => useProfileSwitcherShortcut(onOpen));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "p", metaKey: false, bubbles: true })
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("cleanup removes event listener", () => {
    const onOpen = vi.fn();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useProfileSwitcherShortcut(onOpen));
    const handler = addSpy.mock.calls[0][1];

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", handler);
  });
});

describe("useSidebarToggle", () => {
  beforeEach(() => {
    useAppStore.setState((state) => ({ ...state, sidebarCollapsed: false }));
  });

  it("toggles sidebar on ⌘\\", () => {
    renderHook(() => useSidebarToggle());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", metaKey: true, bubbles: true }));

    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
  });

  it("does NOT toggle sidebar when metaKey is false", () => {
    renderHook(() => useSidebarToggle());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", metaKey: false, bubbles: true }));

    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it("cleans up event listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useSidebarToggle());
    const handler = addSpy.mock.calls[0][1];

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", handler);
  });
});
