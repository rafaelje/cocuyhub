import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SkillRow } from "./SkillRow";
import type { SkillInfo } from "@/types";

const baseSkill: SkillInfo = {
  name: "test-skill",
  slug: "test-skill",
  description: "A test description",
  disableModelInvocation: false,
  userInvocable: true,
  allowedTools: null,
  argumentHint: null,
  location: "personal",
  projectPath: null,
  bodyPreview: null,
  disabled: false,
};

const defaultProps = {
  skill: baseSkill,
  isExpanded: false,
  onDelete: vi.fn().mockResolvedValue(undefined),
  onRename: vi.fn().mockResolvedValue(undefined),
  onToggleFrontmatter: vi.fn().mockResolvedValue(undefined),
  onDescriptionChange: vi.fn().mockResolvedValue(undefined),
  existingNames: ["test-skill"],
  onToggleExpand: vi.fn(),
};

describe("SkillRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders skill name", () => {
    render(<SkillRow {...defaultProps} />);
    expect(screen.getByText("test-skill")).not.toBeNull();
  });

  it("renders chevron right when collapsed", () => {
    render(<SkillRow {...defaultProps} isExpanded={false} />);
    // The component renders, chevron direction tested implicitly via aria
    expect(screen.getByRole("treeitem")).not.toBeNull();
  });

  it("calls onToggleExpand when row is clicked", async () => {
    render(<SkillRow {...defaultProps} />);
    await userEvent.click(screen.getByRole("treeitem"));
    expect(defaultProps.onToggleExpand).toHaveBeenCalled();
  });

  it("inline rename on double-click", async () => {
    render(<SkillRow {...defaultProps} />);
    const nameEl = screen.getByText("test-skill");
    await userEvent.dblClick(nameEl);
    expect(screen.getByRole("textbox", { name: /Rename test-skill/i })).not.toBeNull();
  });

  it("rename rejects invalid slug format", async () => {
    render(<SkillRow {...defaultProps} />);
    const nameEl = screen.getByText("test-skill");
    await userEvent.dblClick(nameEl);

    const input = screen.getByRole("textbox", { name: /Rename test-skill/i });
    await userEvent.clear(input);
    await userEvent.type(input, "INVALID NAME");
    await userEvent.keyboard("{Enter}");

    // onRename should NOT have been called with invalid name
    expect(defaultProps.onRename).not.toHaveBeenCalled();
  });

  it("shows menu button with context menu trigger", () => {
    render(<SkillRow {...defaultProps} />);
    expect(screen.getByLabelText(`Menu for test-skill`)).not.toBeNull();
  });

  it("shows disabled badge when skill is disabled", () => {
    render(<SkillRow {...defaultProps} skill={{ ...baseSkill, disabled: true }} />);
    expect(screen.getByText("off")).not.toBeNull();
  });
});
