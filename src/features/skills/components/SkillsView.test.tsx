import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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
};

function defaultSkillState(overrides: Partial<ReturnType<typeof useSkillStore>> = {}) {
  return {
    skills: [],
    isLoading: false,
    error: null,
    lastProjectPaths: [],
    loadSkills: vi.fn(),
    reloadSkills: vi.fn(),
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
    expect(screen.getByText("Personal")).not.toBeNull();
  });

  it("shows empty state when no skills", () => {
    render(<SkillsView />);
    expect(screen.getByText("No skills found. Create one to get started.")).not.toBeNull();
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
    expect(screen.getByText(/Project:.*my-project/)).not.toBeNull();
  });
});
