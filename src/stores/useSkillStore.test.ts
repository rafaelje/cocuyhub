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
});
