import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
import { SkillCreateForm } from "./SkillCreateForm";

const mockInvoke = vi.mocked(invokeCommand);

describe("SkillCreateForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("form hidden by default, shown after clicking New Skill", async () => {
    render(<SkillCreateForm projectPaths={[]} />);
    expect(screen.queryByLabelText("Skill name")).toBeNull();

    await userEvent.click(screen.getByText("New Skill"));
    expect(screen.getByLabelText("Skill name")).not.toBeNull();
  });

  it("validates name format with canonical regex", async () => {
    render(<SkillCreateForm projectPaths={[]} />);
    await userEvent.click(screen.getByText("New Skill"));

    const nameInput = screen.getByLabelText("Skill name");
    await userEvent.type(nameInput, "INVALID");

    expect(
      screen.getByText("Must be lowercase alphanumeric with hyphens, 1-64 chars")
    ).not.toBeNull();
  });

  it("calls skill_create on submit", async () => {
    mockInvoke.mockResolvedValue({} as never);
    render(<SkillCreateForm projectPaths={[]} />);
    await userEvent.click(screen.getByText("New Skill"));

    await userEvent.type(screen.getByLabelText("Skill name"), "my-skill");
    await userEvent.type(screen.getByLabelText("Skill description"), "A cool skill");
    await userEvent.click(screen.getByText("Create Skill"));

    expect(mockInvoke).toHaveBeenCalledWith("skill_create", {
      name: "my-skill",
      description: "A cool skill",
      location: "personal",
      projectPath: null,
    });
  });

  it("shows error toast on duplicate name", async () => {
    mockInvoke.mockRejectedValue({ message: "Skill 'my-skill' already exists" });
    render(<SkillCreateForm projectPaths={[]} />);
    await userEvent.click(screen.getByText("New Skill"));

    await userEvent.type(screen.getByLabelText("Skill name"), "my-skill");
    await userEvent.click(screen.getByText("Create Skill"));

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to create skill: Skill 'my-skill' already exists",
      { duration: Infinity }
    );
  });

  it("clears form after successful creation", async () => {
    mockInvoke.mockResolvedValue({} as never);
    render(<SkillCreateForm projectPaths={[]} />);
    await userEvent.click(screen.getByText("New Skill"));

    const nameInput = screen.getByLabelText("Skill name");
    await userEvent.type(nameInput, "my-skill");
    await userEvent.click(screen.getByText("Create Skill"));

    // Form should close after success
    expect(screen.queryByLabelText("Skill name")).toBeNull();
  });
});
