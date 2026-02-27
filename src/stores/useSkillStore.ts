import { create } from "zustand";
import { invokeCommand } from "@/lib/ipc";
import type { SkillInfo } from "@/types";

interface SkillState {
  skills: SkillInfo[];
  isLoading: boolean;
  error: string | null;
  lastProjectPaths: string[];
  loadSkills: (projectPaths: string[]) => Promise<void>;
  reloadSkills: () => Promise<void>;
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],
  isLoading: false,
  error: null,
  lastProjectPaths: [],

  loadSkills: async (projectPaths: string[]) => {
    set({ isLoading: true, error: null, lastProjectPaths: projectPaths });
    try {
      const skills = await invokeCommand<SkillInfo[]>("skill_list", { projectPaths });
      set({ skills, isLoading: false });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Failed to load skills";
      set({ error: msg, isLoading: false });
    }
  },

  reloadSkills: async () => {
    const projectPaths = get().lastProjectPaths;
    set({ isLoading: true });
    try {
      const skills = await invokeCommand<SkillInfo[]>("skill_list", { projectPaths });
      set({ skills, error: null, isLoading: false });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Failed to reload skills";
      set({ error: msg, isLoading: false });
    }
  },
}));
