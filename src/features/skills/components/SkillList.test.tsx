import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/stores/useSkillStore", () => ({
  useSkillStore: {
    getState: () => ({ reloadSkills: vi.fn() }),
  },
}));

import { invokeCommand } from "@/lib/ipc";
import { toast } from "sonner";
import { SkillList } from "./SkillList";
import type { SkillInfo } from "@/types";

const mockInvoke = vi.mocked(invokeCommand);

function makeSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "test-skill",
    slug: "test-skill",
    description: null,
    disableModelInvocation: false,
    userInvocable: true,
    allowedTools: null,
    argumentHint: null,
    location: "personal",
    projectPath: null,
    bodyPreview: null,
    disabled: false,
    ...overrides,
  };
}

const baseProps = {
  skills: [] as SkillInfo[],
  location: "personal" as const,
  isLoading: false,
  error: null,
  expandedSkillKey: null,
  skillTree: null,
  isTreeLoading: false,
  treeError: null,
  selectedFilePath: null,
  onToggleExpand: vi.fn(),
  onSelectFile: vi.fn(),
};

describe("SkillList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters skills by location", () => {
    const skills = [
      makeSkill({ slug: "a-skill", name: "a-skill", location: "personal" }),
      makeSkill({ slug: "b-skill", name: "b-skill", location: "desktop_skills" }),
    ];
    render(<SkillList {...baseProps} skills={skills} location="personal" />);
    expect(screen.getByText("a-skill")).not.toBeNull();
    expect(screen.queryByText("b-skill")).toBeNull();
  });

  it("filters project skills by projectPath", () => {
    const skills = [
      makeSkill({ slug: "proj-a", name: "proj-a", location: "project", projectPath: "/a" }),
      makeSkill({ slug: "proj-b", name: "proj-b", location: "project", projectPath: "/b" }),
    ];
    render(<SkillList {...baseProps} skills={skills} location="project" projectPath="/a" />);
    expect(screen.getByText("proj-a")).not.toBeNull();
    expect(screen.queryByText("proj-b")).toBeNull();
  });

  it("sorts skills alphabetically by slug", () => {
    const skills = [
      makeSkill({ slug: "zebra", name: "zebra", location: "personal" }),
      makeSkill({ slug: "alpha", name: "alpha", location: "personal" }),
      makeSkill({ slug: "mango", name: "mango", location: "personal" }),
    ];
    render(<SkillList {...baseProps} skills={skills} />);
    const tree = screen.getByRole("tree");
    const items = within(tree).getAllByRole("treeitem");
    expect(items[0].textContent).toContain("alpha");
    expect(items[1].textContent).toContain("mango");
    expect(items[2].textContent).toContain("zebra");
  });

  it("shows loading skeleton", () => {
    const { container } = render(<SkillList {...baseProps} isLoading={true} />);
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBe(3);
  });

  it("shows error message", () => {
    render(<SkillList {...baseProps} error="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).not.toBeNull();
  });

  it("shows empty state when no skills match", () => {
    render(<SkillList {...baseProps} skills={[]} />);
    expect(screen.getByText("No skills found. Create one to get started.")).not.toBeNull();
  });

  it("renders one SkillRow per filtered skill", () => {
    const skills = [
      makeSkill({ slug: "one", name: "one", location: "personal" }),
      makeSkill({ slug: "two", name: "two", location: "personal" }),
    ];
    render(<SkillList {...baseProps} skills={skills} />);
    const tree = screen.getByRole("tree");
    const items = within(tree).getAllByRole("treeitem");
    expect(items).toHaveLength(2);
  });

  it("delete handler calls skill_delete and shows success toast", async () => {
    mockInvoke.mockResolvedValue(undefined as never);

    const skills = [makeSkill({ slug: "my-skill", name: "my-skill" })];
    render(<SkillList {...baseProps} skills={skills} />);

    // Open dropdown menu
    const menuBtn = screen.getByLabelText("Menu for my-skill");
    await userEvent.click(menuBtn);
    // Click Delete in the dropdown
    const deleteItem = await screen.findByText("Delete");
    await userEvent.click(deleteItem);
    // Confirm in dialog
    const removeBtn = await screen.findByText("Remove");
    await userEvent.click(removeBtn);

    expect(mockInvoke).toHaveBeenCalledWith("skill_delete", {
      slug: "my-skill",
      location: "personal",
      projectPath: undefined,
    });
    expect(toast.success).toHaveBeenCalledWith("Skill my-skill removed", { duration: 3000 });
  });

  it("delete handler shows error toast on failure", async () => {
    mockInvoke.mockRejectedValue({ message: "Permission denied" });

    const skills = [makeSkill({ slug: "my-skill", name: "my-skill" })];
    render(<SkillList {...baseProps} skills={skills} />);

    const menuBtn = screen.getByLabelText("Menu for my-skill");
    await userEvent.click(menuBtn);
    const deleteItem = await screen.findByText("Delete");
    await userEvent.click(deleteItem);
    const removeBtn = await screen.findByText("Remove");
    await userEvent.click(removeBtn);

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to delete skill: Permission denied",
      { duration: Infinity },
    );
  });
});
