import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// jsdom doesn't implement ResizeObserver (needed by react-resizable-panels)
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/stores/useSkillStore", () => ({
  useSkillStore: vi.fn(),
}));
vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: vi.fn(),
}));

import { useSkillStore } from "@/stores/useSkillStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { SkillsView } from "./SkillsView";
import type { SkillInfo } from "@/types";

const mockUseSkillStore = vi.mocked(useSkillStore);
const mockUseConfigStore = vi.mocked(useConfigStore);

const sampleSkill: SkillInfo = {
  name: "my-skill",
  slug: "my-skill",
  description: "A test skill",
  disableModelInvocation: false,
  userInvocable: true,
  allowedTools: null,
  argumentHint: null,
  location: "personal",
  projectPath: null,
  bodyPreview: null,
  disabled: false,
};

function defaultSkillState(overrides: Partial<ReturnType<typeof useSkillStore>> = {}) {
  return {
    skills: [],
    isLoading: false,
    error: null,
    lastProjectPaths: [],
    selectedSkill: null,
    skillTree: null,
    isTreeLoading: false,
    treeError: null,
    selectedFilePath: null,
    fileContent: null,
    savedContent: null,
    isFileLoading: false,
    fileError: null,
    isFileDirty: false,
    isSavingFile: false,
    loadSkills: vi.fn(),
    reloadSkills: vi.fn(),
    selectSkill: vi.fn(),
    loadSkillTree: vi.fn(),
    reloadTree: vi.fn(),
    selectFile: vi.fn(),
    openFile: vi.fn(),
    saveFile: vi.fn(),
    setFileContent: vi.fn(),
    searchQuery: "",
    searchResults: [],
    isSearching: false,
    searchError: null,
    searchSkills: vi.fn(),
    clearSearch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useSkillStore>;
}

describe("SkillsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSkillStore.mockReturnValue(defaultSkillState());
    mockUseConfigStore.mockReturnValue({ projects: {} } as unknown as ReturnType<typeof useConfigStore>);
  });

  it("renders personal skills section header", () => {
    render(<SkillsView />);
    expect(screen.getByText("Claude Code Skills")).not.toBeNull();
  });

  it("shows empty state when no skills (personal section expanded by default)", () => {
    render(<SkillsView />);
    expect(screen.getByText("No skills found. Create one to get started.")).not.toBeNull();
  });

  it("shows right panel empty state when no skill selected", () => {
    render(<SkillsView />);
    expect(screen.getByText("Select a skill and file to start editing")).not.toBeNull();
  });

  it("shows loading skeleton when isLoading", () => {
    mockUseSkillStore.mockReturnValue(defaultSkillState({ isLoading: true }));
    const { container } = render(<SkillsView />);
    expect(container.querySelectorAll(".animate-pulse").length).toBe(3);
  });

  it("renders skill names from store", () => {
    mockUseSkillStore.mockReturnValue(
      defaultSkillState({ skills: [sampleSkill] })
    );
    render(<SkillsView />);
    expect(screen.getByText("my-skill")).not.toBeNull();
  });

  it("renders project section when projects exist", () => {
    mockUseConfigStore.mockReturnValue({
      projects: { "/Users/rafa/my-project": {} },
    } as unknown as ReturnType<typeof useConfigStore>);
    mockUseSkillStore.mockReturnValue(defaultSkillState());
    render(<SkillsView />);
    expect(screen.getByText("Projects")).not.toBeNull();
    expect(screen.getByText("my-project")).not.toBeNull();
  });

  // ── Search trigger ──

  it("renders search trigger button with shortcut hint", () => {
    render(<SkillsView />);
    expect(screen.getByText("Search skills...")).not.toBeNull();
  });

  it("search trigger button shows keyboard shortcut", () => {
    render(<SkillsView />);
    expect(screen.getByText("⌘K")).not.toBeNull();
  });
});
