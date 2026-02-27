import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/features/profiles/components/ProfileSwitcher", () => ({
  ProfileSwitcher: React.forwardRef(() => <div data-testid="profile-switcher" />),
}));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({
  useProfileSwitcherShortcut: vi.fn(),
  useNavigationShortcuts: vi.fn(),
  useSidebarToggle: vi.fn(),
  useManualSnapshotShortcut: vi.fn(),
}));
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: vi.fn(),
}));
vi.mock("@/stores/useSettingsStore", () => ({
  useSettingsStore: vi.fn(),
}));

import { useConfigStore } from "@/stores/useConfigStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { Header } from "./Header";

const mockConfigStore = vi.mocked(useConfigStore);
const mockSettingsStore = vi.mocked(useSettingsStore);

function setupMocks() {
  const configState = {
    codeConfig: null,
    desktopConfig: null,
    codeError: null,
    desktopError: null,
  };
  mockConfigStore.mockImplementation((selector?: (s: unknown) => unknown) =>
    selector ? selector(configState) : configState
  );
  const settingsState = { codePath: null, desktopPath: null };
  mockSettingsStore.mockImplementation((selector?: (s: unknown) => unknown) =>
    selector ? selector(settingsState) : settingsState
  );
}

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders ProfileSwitcher in the header", () => {
    render(<Header />);
    expect(screen.getByTestId("profile-switcher")).not.toBeNull();
  });

  it("renders AI Panel title", () => {
    render(<Header />);
    expect(screen.getByText("AI Panel")).not.toBeNull();
  });

  it("AI Panel name appears before ProfileSwitcher in DOM order", () => {
    const { container } = render(<Header />);
    const header = container.querySelector("header")!;
    const children = Array.from(header.children);
    const nameIdx = children.findIndex((el) => el.textContent?.includes("AI Panel"));
    const switcherIdx = children.findIndex(
      (el) => el.getAttribute("data-testid") === "profile-switcher"
    );
    expect(nameIdx).toBeGreaterThanOrEqual(0);
    expect(switcherIdx).toBeGreaterThanOrEqual(0);
    expect(nameIdx).toBeLessThan(switcherIdx);
  });
});
