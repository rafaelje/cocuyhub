import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";

describe("useAppStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStore.setState({
      sidebarCollapsed: false,
      isLoading: false,
      error: null,
      processStatus: { code: false, desktop: false },
      editorDirty: false,
      externalChangeWarning: false,
      snapshotFormOpen: false,
      updateVersion: null,
      downloadProgress: null,
      updateReady: false,
    });
  });

  it("has correct initial state", () => {
    const state = useAppStore.getState();
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.processStatus).toEqual({ code: false, desktop: false });
    expect(state.editorDirty).toBe(false);
    expect(state.externalChangeWarning).toBe(false);
    expect(state.snapshotFormOpen).toBe(false);
    expect(state.updateVersion).toBeNull();
    expect(state.downloadProgress).toBeNull();
    expect(state.updateReady).toBe(false);
  });

  it("toggleSidebar toggles sidebarCollapsed from false to true", () => {
    const { toggleSidebar } = useAppStore.getState();
    toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
  });

  it("toggleSidebar toggles sidebarCollapsed from true to false", () => {
    useAppStore.setState((state) => ({ ...state, sidebarCollapsed: true }));
    const { toggleSidebar } = useAppStore.getState();
    toggleSidebar();
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it("setSidebarCollapsed sets sidebarCollapsed to true", () => {
    const { setSidebarCollapsed } = useAppStore.getState();
    setSidebarCollapsed(true);
    expect(useAppStore.getState().sidebarCollapsed).toBe(true);
  });

  it("setSidebarCollapsed sets sidebarCollapsed to false", () => {
    useAppStore.setState((state) => ({ ...state, sidebarCollapsed: true }));
    const { setSidebarCollapsed } = useAppStore.getState();
    setSidebarCollapsed(false);
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });

  it("does not drop other fields when toggling sidebar", () => {
    useAppStore.setState((state) => ({ ...state, isLoading: true }));
    const { toggleSidebar } = useAppStore.getState();
    toggleSidebar();
    const state = useAppStore.getState();
    expect(state.sidebarCollapsed).toBe(true);
    expect(state.isLoading).toBe(true);
  });

  it("setProcessStatus updates code process status", () => {
    const { setProcessStatus } = useAppStore.getState();
    setProcessStatus("code", true);
    expect(useAppStore.getState().processStatus.code).toBe(true);
    expect(useAppStore.getState().processStatus.desktop).toBe(false);
  });

  it("setProcessStatus updates desktop process status", () => {
    const { setProcessStatus } = useAppStore.getState();
    setProcessStatus("desktop", true);
    expect(useAppStore.getState().processStatus.desktop).toBe(true);
    expect(useAppStore.getState().processStatus.code).toBe(false);
  });

  it("setEditorDirty sets editorDirty to true", () => {
    const { setEditorDirty } = useAppStore.getState();
    setEditorDirty(true);
    expect(useAppStore.getState().editorDirty).toBe(true);
  });

  it("setEditorDirty sets editorDirty to false", () => {
    useAppStore.setState((state) => ({ ...state, editorDirty: true }));
    const { setEditorDirty } = useAppStore.getState();
    setEditorDirty(false);
    expect(useAppStore.getState().editorDirty).toBe(false);
  });

  it("setExternalChangeWarning sets externalChangeWarning", () => {
    const { setExternalChangeWarning } = useAppStore.getState();
    setExternalChangeWarning(true);
    expect(useAppStore.getState().externalChangeWarning).toBe(true);
  });

  it("does not drop other fields when setting processStatus", () => {
    useAppStore.setState((state) => ({ ...state, editorDirty: true }));
    const { setProcessStatus } = useAppStore.getState();
    setProcessStatus("code", true);
    const state = useAppStore.getState();
    expect(state.processStatus.code).toBe(true);
    expect(state.editorDirty).toBe(true);
  });

  it("has snapshotFormOpen: false as initial state", () => {
    expect(useAppStore.getState().snapshotFormOpen).toBe(false);
  });

  it("setSnapshotFormOpen(true) sets snapshotFormOpen to true", () => {
    const { setSnapshotFormOpen } = useAppStore.getState();
    setSnapshotFormOpen(true);
    expect(useAppStore.getState().snapshotFormOpen).toBe(true);
  });

  it("setSnapshotFormOpen(false) sets snapshotFormOpen to false", () => {
    useAppStore.setState((state) => ({ ...state, snapshotFormOpen: true }));
    const { setSnapshotFormOpen } = useAppStore.getState();
    setSnapshotFormOpen(false);
    expect(useAppStore.getState().snapshotFormOpen).toBe(false);
  });

  it("setSnapshotFormOpen does not drop other fields", () => {
    useAppStore.setState((state) => ({ ...state, editorDirty: true }));
    const { setSnapshotFormOpen } = useAppStore.getState();
    setSnapshotFormOpen(true);
    const state = useAppStore.getState();
    expect(state.snapshotFormOpen).toBe(true);
    expect(state.editorDirty).toBe(true);
  });

  it("setUpdateVersion sets updateVersion to a version string", () => {
    const { setUpdateVersion } = useAppStore.getState();
    setUpdateVersion("1.2.3");
    expect(useAppStore.getState().updateVersion).toBe("1.2.3");
  });

  it("setUpdateVersion(null) clears updateVersion back to null", () => {
    useAppStore.setState((state) => ({ ...state, updateVersion: "1.0.0" }));
    const { setUpdateVersion } = useAppStore.getState();
    setUpdateVersion(null);
    expect(useAppStore.getState().updateVersion).toBeNull();
  });

  it("setUpdateVersion does not drop other fields", () => {
    useAppStore.setState((state) => ({ ...state, editorDirty: true }));
    const { setUpdateVersion } = useAppStore.getState();
    setUpdateVersion("2.0.0");
    const state = useAppStore.getState();
    expect(state.updateVersion).toBe("2.0.0");
    expect(state.editorDirty).toBe(true);
  });

  it("setDownloadProgress sets downloadProgress to a number", () => {
    const { setDownloadProgress } = useAppStore.getState();
    setDownloadProgress(42);
    expect(useAppStore.getState().downloadProgress).toBe(42);
  });

  it("setDownloadProgress(null) clears downloadProgress", () => {
    useAppStore.setState((state) => ({ ...state, downloadProgress: 50 }));
    const { setDownloadProgress } = useAppStore.getState();
    setDownloadProgress(null);
    expect(useAppStore.getState().downloadProgress).toBeNull();
  });

  it("setDownloadProgress does not drop other fields", () => {
    useAppStore.setState((state) => ({ ...state, editorDirty: true }));
    const { setDownloadProgress } = useAppStore.getState();
    setDownloadProgress(75);
    const state = useAppStore.getState();
    expect(state.downloadProgress).toBe(75);
    expect(state.editorDirty).toBe(true);
  });

  it("setUpdateReady sets updateReady to true", () => {
    const { setUpdateReady } = useAppStore.getState();
    setUpdateReady(true);
    expect(useAppStore.getState().updateReady).toBe(true);
  });

  it("setUpdateReady(false) clears updateReady", () => {
    useAppStore.setState((state) => ({ ...state, updateReady: true }));
    const { setUpdateReady } = useAppStore.getState();
    setUpdateReady(false);
    expect(useAppStore.getState().updateReady).toBe(false);
  });

  it("setUpdateReady does not drop other fields", () => {
    useAppStore.setState((state) => ({ ...state, editorDirty: true }));
    const { setUpdateReady } = useAppStore.getState();
    setUpdateReady(true);
    const state = useAppStore.getState();
    expect(state.updateReady).toBe(true);
    expect(state.editorDirty).toBe(true);
  });
});
