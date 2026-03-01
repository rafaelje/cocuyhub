import { create } from "zustand";
import { invokeCommand } from "@/lib/ipc";
import type { SkillInfo, SkillSearchResult, SkillTreeNode } from "@/types";

interface SkillState {
  // List
  skills: SkillInfo[];
  isLoading: boolean;
  error: string | null;
  lastProjectPaths: string[];
  // Selection + tree
  selectedSkill: SkillInfo | null;
  skillTree: SkillTreeNode | null;
  isTreeLoading: boolean;
  treeError: string | null;
  // File editor
  selectedFilePath: string | null;
  fileContent: string | null;
  savedContent: string | null;  // last content committed to disk
  isFileLoading: boolean;
  fileError: string | null;
  isFileDirty: boolean;
  isSavingFile: boolean;
  // Search
  searchQuery: string;
  searchResults: SkillSearchResult[];
  isSearching: boolean;
  searchError: string | null;

  // Actions
  loadSkills: (projectPaths: string[]) => Promise<void>;
  reloadSkills: () => Promise<void>;
  selectSkill: (skill: SkillInfo | null) => void;
  loadSkillTree: (slug: string, location: string, projectPath: string | null) => Promise<void>;
  reloadTree: () => Promise<void>;
  selectFile: (relPath: string | null) => void;
  openFile: (slug: string, location: string, projectPath: string | null, relPath: string) => Promise<void>;
  saveFile: (slug: string, location: string, projectPath: string | null, relPath: string, content: string) => Promise<void>;
  setFileContent: (content: string) => void;
  searchSkills: (query: string, projectPaths: string[]) => Promise<void>;
  clearSearch: () => void;
}

// Monotonically-increasing counter to detect stale openFile responses (M-2)
let openFileSeq = 0;
// Counter to detect stale search responses
let searchSeq = 0;

export const useSkillStore = create<SkillState>((set, get) => ({
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
  searchQuery: "",
  searchResults: [],
  isSearching: false,
  searchError: null,

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

  selectSkill: (skill: SkillInfo | null) => {
    set({
      selectedSkill: skill,
      skillTree: null,
      treeError: null,
      selectedFilePath: null,
      fileContent: null,
      savedContent: null,
      fileError: null,
      isFileDirty: false,
    });
  },

  loadSkillTree: async (slug: string, location: string, projectPath: string | null) => {
    set({ isTreeLoading: true, treeError: null });
    try {
      const tree = await invokeCommand<SkillTreeNode>("skill_tree_read", {
        slug,
        location,
        projectPath,
      });
      set({ skillTree: tree, isTreeLoading: false });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Failed to load skill tree";
      set({ treeError: msg, isTreeLoading: false });
    }
  },

  reloadTree: async () => {
    const { selectedSkill } = get();
    if (!selectedSkill) return;
    await get().loadSkillTree(selectedSkill.slug, selectedSkill.location, selectedSkill.projectPath);
  },

  selectFile: (relPath: string | null) => {
    set({ selectedFilePath: relPath, fileContent: null, savedContent: null, fileError: null, isFileDirty: false });
  },

  openFile: async (slug: string, location: string, projectPath: string | null, relPath: string) => {
    const seq = ++openFileSeq;
    set({ isFileLoading: true, fileError: null, selectedFilePath: relPath, isFileDirty: false, savedContent: null });
    try {
      const content = await invokeCommand<string>("skill_file_read", {
        slug,
        location,
        projectPath,
        relPath,
      });
      // Discard stale responses — user may have clicked a different file (M-2)
      if (seq !== openFileSeq) return;
      set({ fileContent: content, savedContent: content, isFileLoading: false });
    } catch (err) {
      if (seq !== openFileSeq) return;
      const msg = (err as { message?: string })?.message ?? "Failed to read file";
      set({ fileError: msg, isFileLoading: false });
    }
  },

  saveFile: async (slug: string, location: string, projectPath: string | null, relPath: string, content: string) => {
    set({ isSavingFile: true });
    try {
      await invokeCommand("skill_file_write", { slug, location, projectPath, relPath, content });
      set({ isSavingFile: false, isFileDirty: false, fileContent: content, savedContent: content });
    } catch (err) {
      set({ isSavingFile: false });
      throw err;
    }
  },

  // M-1: compare against last saved-to-disk content, not previous in-memory value
  setFileContent: (content: string) => {
    const { savedContent } = get();
    set({ fileContent: content, isFileDirty: content !== savedContent });
  },

  searchSkills: async (query: string, projectPaths: string[]) => {
    const seq = ++searchSeq;
    set({ searchQuery: query, isSearching: true, searchError: null });
    try {
      const results = await invokeCommand<SkillSearchResult[]>("skill_search", { query, projectPaths });
      // Discard stale responses — user may have typed more
      if (seq !== searchSeq) return;
      set({ searchResults: results, isSearching: false });
    } catch (err) {
      if (seq !== searchSeq) return;
      const msg = (err as { message?: string })?.message ?? "Search failed";
      set({ searchError: msg, isSearching: false });
    }
  },

  clearSearch: () => {
    ++searchSeq; // invalidate any in-flight search
    set({ searchQuery: "", searchResults: [], isSearching: false, searchError: null });
  },
}));
