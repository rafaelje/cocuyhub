import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/stores/useSkillStore", () => ({
  useSkillStore: vi.fn(() => ({ reloadTree: vi.fn() })),
}));

import { SkillWorkspaceTree } from "./SkillWorkspaceTree";
import type { SkillTreeNode, SkillInfo } from "@/types";

const mockSkill: SkillInfo = {
  name: "my-skill",
  slug: "my-skill",
  description: null,
  disableModelInvocation: false,
  userInvocable: true,
  allowedTools: null,
  argumentHint: null,
  location: "personal",
  projectPath: null,
  bodyPreview: null,
  disabled: false,
};

const tree: SkillTreeNode = {
  name: "my-skill",
  path: "/",
  nodeType: "dir",
  children: [
    {
      name: "docs",
      path: "/docs",
      nodeType: "dir",
      children: [
        { name: "guide.md", path: "/docs/guide.md", nodeType: "file", children: [] },
      ],
    },
    { name: "SKILL.md", path: "/SKILL.md", nodeType: "file", children: [] },
  ],
};

const defaultProps = {
  tree,
  skill: mockSkill,
  selectedFilePath: null,
  onSelectFile: vi.fn(),
};

describe("SkillWorkspaceTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the root node expanded by default", () => {
    render(<SkillWorkspaceTree {...defaultProps} />);
    expect(screen.getByLabelText("my-skill")).toBeTruthy();
    expect(screen.getByLabelText("docs")).toBeTruthy();
    expect(screen.getByLabelText("SKILL.md")).toBeTruthy();
  });

  it("does not render nested children when parent dir is collapsed", () => {
    render(<SkillWorkspaceTree {...defaultProps} />);
    // docs dir is visible but its child (guide.md) is collapsed initially
    expect(screen.queryByLabelText("guide.md")).toBeNull();
  });

  it("expands a collapsed dir on click", () => {
    render(<SkillWorkspaceTree {...defaultProps} />);
    const docsBtn = screen.getByLabelText("docs");
    fireEvent.click(docsBtn);
    expect(screen.getByLabelText("guide.md")).toBeTruthy();
  });

  it("collapses an expanded dir on second click", () => {
    render(<SkillWorkspaceTree {...defaultProps} />);
    const docsBtn = screen.getByLabelText("docs");
    fireEvent.click(docsBtn); // expand
    expect(screen.getByLabelText("guide.md")).toBeTruthy();
    fireEvent.click(docsBtn); // collapse
    expect(screen.queryByLabelText("guide.md")).toBeNull();
  });

  it("calls onSelectFile when a file is clicked", () => {
    const onSelectFile = vi.fn();
    render(<SkillWorkspaceTree {...defaultProps} onSelectFile={onSelectFile} />);
    const skillMd = screen.getByLabelText("SKILL.md");
    fireEvent.click(skillMd);
    expect(onSelectFile).toHaveBeenCalledWith("/SKILL.md");
  });

  it("renders file nodes without chevron", () => {
    render(<SkillWorkspaceTree {...defaultProps} />);
    const skillMd = screen.getByLabelText("SKILL.md");
    expect(skillMd).toBeTruthy();
  });

  it("highlights selected file with emerald color", () => {
    render(<SkillWorkspaceTree {...defaultProps} selectedFilePath="/SKILL.md" />);
    const skillMd = screen.getByLabelText("SKILL.md");
    expect(skillMd.className).toContain("emerald");
  });
});
