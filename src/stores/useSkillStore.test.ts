import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));

import { invokeCommand } from "@/lib/ipc";
import { useSkillStore } from "./useSkillStore";

const mockInvoke = vi.mocked(invokeCommand);

describe("useSkillStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSkillStore.setState({
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
    });
  });

  it("loadSkills calls invokeCommand and sets state", async () => {
    const mockSkills = [{ slug: "a", name: "a", location: "personal" }];
    mockInvoke.mockResolvedValue(mockSkills as never);

    await useSkillStore.getState().loadSkills(["/project"]);

    expect(mockInvoke).toHaveBeenCalledWith("skill_list", { projectPaths: ["/project"] });
    expect(useSkillStore.getState().skills).toEqual(mockSkills);
    expect(useSkillStore.getState().isLoading).toBe(false);
  });

  it("loadSkills saves lastProjectPaths", async () => {
    mockInvoke.mockResolvedValue([] as never);
    await useSkillStore.getState().loadSkills(["/p1", "/p2"]);
    expect(useSkillStore.getState().lastProjectPaths).toEqual(["/p1", "/p2"]);
  });

  it("reloadSkills uses lastProjectPaths without arguments", async () => {
    mockInvoke.mockResolvedValue([] as never);
    useSkillStore.setState({ lastProjectPaths: ["/cached"] });

    await useSkillStore.getState().reloadSkills();

    expect(mockInvoke).toHaveBeenCalledWith("skill_list", { projectPaths: ["/cached"] });
  });

  it("selectSkill sets selectedSkill and clears tree state", () => {
    const skill = { slug: "a", name: "a", location: "personal" as const } as never;
    useSkillStore.setState({ skillTree: { name: "a", path: "/", nodeType: "dir", children: [] }, treeError: "old" });

    useSkillStore.getState().selectSkill(skill);

    expect(useSkillStore.getState().selectedSkill).toEqual(skill);
    expect(useSkillStore.getState().skillTree).toBeNull();
    expect(useSkillStore.getState().treeError).toBeNull();
  });

  it("loadSkillTree calls skill_tree_read and sets skillTree", async () => {
    const mockTree = { name: "my-skill", path: "/", nodeType: "dir", children: [] };
    mockInvoke.mockResolvedValue(mockTree as never);

    await useSkillStore.getState().loadSkillTree("my-skill", "personal", null);

    expect(mockInvoke).toHaveBeenCalledWith("skill_tree_read", {
      slug: "my-skill",
      location: "personal",
      projectPath: null,
    });
    expect(useSkillStore.getState().skillTree).toEqual(mockTree);
    expect(useSkillStore.getState().isTreeLoading).toBe(false);
  });

  it("loadSkillTree sets treeError on failure", async () => {
    mockInvoke.mockRejectedValue({ message: "not found" } as never);

    await useSkillStore.getState().loadSkillTree("bad-skill", "personal", null);

    expect(useSkillStore.getState().treeError).toBe("not found");
    expect(useSkillStore.getState().skillTree).toBeNull();
    expect(useSkillStore.getState().isTreeLoading).toBe(false);
  });

  it("selectFile sets selectedFilePath and clears file state", () => {
    useSkillStore.setState({ fileContent: "old", fileError: "err", isFileDirty: true });
    useSkillStore.getState().selectFile("/SKILL.md");
    expect(useSkillStore.getState().selectedFilePath).toBe("/SKILL.md");
    expect(useSkillStore.getState().fileContent).toBeNull();
    expect(useSkillStore.getState().fileError).toBeNull();
    expect(useSkillStore.getState().isFileDirty).toBe(false);
  });

  it("openFile calls skill_file_read, sets fileContent and savedContent", async () => {
    mockInvoke.mockResolvedValue("# Hello" as never);

    await useSkillStore.getState().openFile("my-skill", "personal", null, "/SKILL.md");

    expect(mockInvoke).toHaveBeenCalledWith("skill_file_read", {
      slug: "my-skill",
      location: "personal",
      projectPath: null,
      relPath: "/SKILL.md",
    });
    expect(useSkillStore.getState().fileContent).toBe("# Hello");
    expect(useSkillStore.getState().savedContent).toBe("# Hello");
    expect(useSkillStore.getState().isFileLoading).toBe(false);
    expect(useSkillStore.getState().selectedFilePath).toBe("/SKILL.md");
  });

  it("openFile sets fileError on failure", async () => {
    mockInvoke.mockRejectedValue({ message: "read error" } as never);

    await useSkillStore.getState().openFile("my-skill", "personal", null, "/missing.md");

    expect(useSkillStore.getState().fileError).toBe("read error");
    expect(useSkillStore.getState().isFileLoading).toBe(false);
  });

  it("setFileContent marks dirty when content differs from savedContent", () => {
    useSkillStore.setState({ fileContent: "original", savedContent: "original" });
    useSkillStore.getState().setFileContent("modified");
    expect(useSkillStore.getState().fileContent).toBe("modified");
    expect(useSkillStore.getState().isFileDirty).toBe(true);
  });

  it("setFileContent marks clean when content matches savedContent (revert)", () => {
    useSkillStore.setState({ fileContent: "modified", savedContent: "original" });
    useSkillStore.getState().setFileContent("original");
    expect(useSkillStore.getState().isFileDirty).toBe(false);
  });

  it("setFileContent marks clean when savedContent is null and empty string set", () => {
    useSkillStore.setState({ fileContent: null, savedContent: null });
    useSkillStore.getState().setFileContent("");
    // empty !== null so still dirty
    expect(useSkillStore.getState().isFileDirty).toBe(true);
  });

  it("saveFile calls skill_file_write and updates savedContent", async () => {
    mockInvoke.mockResolvedValue(undefined as never);
    useSkillStore.setState({ isFileDirty: true });

    await useSkillStore.getState().saveFile("my-skill", "personal", null, "/SKILL.md", "new content");

    expect(mockInvoke).toHaveBeenCalledWith("skill_file_write", {
      slug: "my-skill",
      location: "personal",
      projectPath: null,
      relPath: "/SKILL.md",
      content: "new content",
    });
    expect(useSkillStore.getState().isFileDirty).toBe(false);
    expect(useSkillStore.getState().isSavingFile).toBe(false);
    expect(useSkillStore.getState().fileContent).toBe("new content");
    expect(useSkillStore.getState().savedContent).toBe("new content");
  });

  it("saveFile throws on failure and clears isSavingFile", async () => {
    mockInvoke.mockRejectedValue({ message: "write error" } as never);

    await expect(
      useSkillStore.getState().saveFile("my-skill", "personal", null, "/SKILL.md", "content")
    ).rejects.toMatchObject({ message: "write error" });

    expect(useSkillStore.getState().isSavingFile).toBe(false);
  });

  it("reloadTree calls loadSkillTree with selectedSkill", async () => {
    const mockTree = { name: "x", path: "/", nodeType: "dir", children: [] };
    mockInvoke.mockResolvedValue(mockTree as never);
    useSkillStore.setState({
      selectedSkill: { slug: "x", location: "personal", projectPath: null } as never,
    });

    await useSkillStore.getState().reloadTree();

    expect(mockInvoke).toHaveBeenCalledWith("skill_tree_read", {
      slug: "x",
      location: "personal",
      projectPath: null,
    });
  });

  it("reloadTree is no-op when no skill selected", async () => {
    useSkillStore.setState({ selectedSkill: null });
    await useSkillStore.getState().reloadTree();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
