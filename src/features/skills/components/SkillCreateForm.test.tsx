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
import type { CopyDestination } from "./destinations";

const mockInvoke = vi.mocked(invokeCommand);

const personalOnly: CopyDestination[] = [
  { label: "Claude Code Skills", location: "personal", projectPath: null },
];

const multipleDestinations: CopyDestination[] = [
  { label: "Claude Code Skills", location: "personal", projectPath: null },
  { label: "Claude Desktop Skills", location: "desktop_skills", projectPath: null },
  { label: "Project: my/app", location: "project", projectPath: "/home/user/my/app" },
];

describe("SkillCreateForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("form hidden by default, shown after clicking New Skill", async () => {
    render(<SkillCreateForm availableDestinations={personalOnly} />);
    expect(screen.queryByLabelText("Skill name")).toBeNull();

    await userEvent.click(screen.getByText("New Skill"));
    expect(screen.getByLabelText("Skill name")).not.toBeNull();
  });

  it("validates name format with canonical regex", async () => {
    render(<SkillCreateForm availableDestinations={personalOnly} />);
    await userEvent.click(screen.getByText("New Skill"));

    const nameInput = screen.getByLabelText("Skill name");
    await userEvent.type(nameInput, "INVALID");

    expect(
      screen.getByText("Must be lowercase alphanumeric with hyphens, 1-64 chars")
    ).not.toBeNull();
  });

  it("calls skill_create on submit", async () => {
    mockInvoke.mockResolvedValue({} as never);
    render(<SkillCreateForm availableDestinations={personalOnly} />);
    await userEvent.click(screen.getByText("New Skill"));

    await userEvent.type(screen.getByLabelText("Skill name"), "my-skill");
    await userEvent.type(screen.getByLabelText("Skill description"), "A cool skill");
    await userEvent.click(screen.getByText("Create"));

    expect(mockInvoke).toHaveBeenCalledWith("skill_create", {
      name: "my-skill",
      description: "A cool skill",
      location: "personal",
      projectPath: null,
      instructions: null,
    });
  });

  it("shows error toast on duplicate name", async () => {
    mockInvoke.mockRejectedValue({ message: "Skill 'my-skill' already exists" });
    render(<SkillCreateForm availableDestinations={personalOnly} />);
    await userEvent.click(screen.getByText("New Skill"));

    await userEvent.type(screen.getByLabelText("Skill name"), "my-skill");
    await userEvent.click(screen.getByText("Create"));

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to create skill: Skill 'my-skill' already exists",
      { duration: Infinity }
    );
  });

  it("clears form after successful creation", async () => {
    mockInvoke.mockResolvedValue({} as never);
    render(<SkillCreateForm availableDestinations={personalOnly} />);
    await userEvent.click(screen.getByText("New Skill"));

    const nameInput = screen.getByLabelText("Skill name");
    await userEvent.type(nameInput, "my-skill");
    await userEvent.click(screen.getByText("Create"));

    // Form should close after success
    expect(screen.queryByLabelText("Skill name")).toBeNull();
  });

  it("does not show location selector with single destination", async () => {
    render(<SkillCreateForm availableDestinations={personalOnly} />);
    await userEvent.click(screen.getByText("New Skill"));
    expect(screen.queryByLabelText("Skill location")).toBeNull();
  });

  it("shows location selector with multiple destinations", async () => {
    render(<SkillCreateForm availableDestinations={multipleDestinations} />);
    await userEvent.click(screen.getByText("New Skill"));
    expect(screen.getByLabelText("Skill location")).not.toBeNull();
  });
});
