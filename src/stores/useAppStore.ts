import { create } from "zustand";
import type { ToolTarget } from "@/types";

interface ProcessStatus {
  code: boolean;
  desktop: boolean;
}

interface AppState {
  sidebarCollapsed: boolean;
  isLoading: boolean;
  error: null;
  processStatus: ProcessStatus;
  editorDirty: boolean;
  externalChangeWarning: boolean;
  snapshotFormOpen: boolean;
  configActiveTool: ToolTarget;
  updateVersion: string | null;
  downloadProgress: number | null;
  updateReady: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setProcessStatus: (tool: ToolTarget, active: boolean) => void;
  setEditorDirty: (dirty: boolean) => void;
  setExternalChangeWarning: (warning: boolean) => void;
  setSnapshotFormOpen: (open: boolean) => void;
  setConfigActiveTool: (tool: ToolTarget) => void;
  setUpdateVersion: (version: string | null) => void;
  setDownloadProgress: (progress: number | null) => void;
  setUpdateReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  isLoading: false,
  error: null,
  processStatus: { code: false, desktop: false },
  editorDirty: false,
  externalChangeWarning: false,
  snapshotFormOpen: false,
  configActiveTool: "code",
  updateVersion: null,
  downloadProgress: null,
  updateReady: false,
  toggleSidebar: () =>
    set((state) => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed: boolean) =>
    set((state) => ({ ...state, sidebarCollapsed: collapsed })),
  setProcessStatus: (tool: ToolTarget, active: boolean) =>
    set((state) => ({
      ...state,
      processStatus: { ...state.processStatus, [tool]: active },
    })),
  setEditorDirty: (dirty: boolean) =>
    set((state) => ({ ...state, editorDirty: dirty })),
  setExternalChangeWarning: (warning: boolean) =>
    set((state) => ({ ...state, externalChangeWarning: warning })),
  setSnapshotFormOpen: (open: boolean) =>
    set((state) => ({ ...state, snapshotFormOpen: open })),
  setConfigActiveTool: (tool: ToolTarget) =>
    set((state) => ({ ...state, configActiveTool: tool })),
  setUpdateVersion: (version) =>
    set((state) => ({ ...state, updateVersion: version })),
  setDownloadProgress: (progress) =>
    set((state) => ({ ...state, downloadProgress: progress })),
  setUpdateReady: (ready) =>
    set((state) => ({ ...state, updateReady: ready })),
}));
