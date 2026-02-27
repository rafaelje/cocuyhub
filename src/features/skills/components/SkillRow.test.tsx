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
};

const defaultProps = {
  skill: baseSkill,
  onDelete: vi.fn().mockResolvedValue(undefined),
  onRename: vi.fn().mockResolvedValue(undefined),
  onToggleFrontmatter: vi.fn().mockResolvedValue(undefined),
  onDescriptionChange: vi.fn().mockResolvedValue(undefined),
  existingNames: ["test-skill"],
};

describe("SkillRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders skill name and description", () => {
    render(<SkillRow {...defaultProps} />);
    expect(screen.getByText("test-skill")).not.toBeNull();
    expect(screen.getByText("A test description")).not.toBeNull();
  });

  it("renders body preview when present", () => {
    const skill = { ...baseSkill, bodyPreview: "Some preview text" };
    render(<SkillRow {...defaultProps} skill={skill} />);
    expect(screen.getByText("Some preview text")).not.toBeNull();
  });

  it("toggles disable-model-invocation switch with inverted logic", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    render(<SkillRow {...defaultProps} onToggleFrontmatter={onToggle} />);

    // Model invocation should be checked (since disableModelInvocation=false)
    const modelSwitch = screen.getByRole("switch", { name: /Model Invocation/i });
    expect(modelSwitch.getAttribute("data-state")).toBe("checked");

    await userEvent.click(modelSwitch);
    expect(onToggle).toHaveBeenCalledWith("test-skill", "disable-model-invocation", "true");
  });

  it("toggles user-invocable switch with direct logic", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    render(<SkillRow {...defaultProps} onToggleFrontmatter={onToggle} />);

    const userSwitch = screen.getByRole("switch", { name: /User Invocable/i });
    expect(userSwitch.getAttribute("data-state")).toBe("checked");

    await userEvent.click(userSwitch);
    expect(onToggle).toHaveBeenCalledWith("test-skill", "user-invocable", "false");
  });

  it("shows delete confirmation dialog", async () => {
    render(<SkillRow {...defaultProps} />);
    const deleteBtn = screen.getByRole("button", { name: /Remove test-skill/i });
    await userEvent.click(deleteBtn);
    expect(screen.getByText("Remove skill?")).not.toBeNull();
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

  it("optimistic toggle rollback on error", async () => {
    const onToggle = vi.fn().mockRejectedValue(new Error("fail"));
    render(<SkillRow {...defaultProps} onToggleFrontmatter={onToggle} />);

    const modelSwitch = screen.getByRole("switch", { name: /Model Invocation/i });
    await userEvent.click(modelSwitch);

    // After error, should roll back to checked
    expect(modelSwitch.getAttribute("data-state")).toBe("checked");
  });
});
