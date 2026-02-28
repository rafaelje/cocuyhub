import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

import { toast } from "sonner";
import { useSkillStore } from "@/stores/useSkillStore";
import { SkillFileEditor } from "./SkillFileEditor";
import type { SkillInfo } from "@/types";

const mockOpenFile = vi.fn();
const mockSaveFile = vi.fn();
const mockSetFileContent = vi.fn();

interface PartialStore {
  fileContent?: string | null;
  savedContent?: string | null;
  isFileLoading?: boolean;
  fileError?: string | null;
  isFileDirty?: boolean;
  isSavingFile?: boolean;
  openFile?: ReturnType<typeof vi.fn>;
  saveFile?: ReturnType<typeof vi.fn>;
  setFileContent?: ReturnType<typeof vi.fn>;
}

const baseStoreState: PartialStore = {
  fileContent: "# Hello",
  savedContent: "# Hello",
  isFileLoading: false,
  fileError: null,
  isFileDirty: false,
  isSavingFile: false,
  openFile: mockOpenFile,
  saveFile: mockSaveFile,
  setFileContent: mockSetFileContent,
};

const mockSkill: SkillInfo = {
  slug: "my-skill",
  name: "My Skill",
  location: "personal",
  projectPath: null,
  disabled: false,
  description: null,
  disableModelInvocation: false,
  userInvocable: true,
  allowedTools: null,
  argumentHint: null,
  bodyPreview: null,
};

function setStore(overrides: PartialStore = {}) {
  useSkillStore.setState({ ...baseStoreState, ...overrides } as never);
}

describe("SkillFileEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStore();
  });

  it("calls openFile on mount with correct args", () => {
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    expect(mockOpenFile).toHaveBeenCalledWith("my-skill", "personal", null, "/SKILL.md");
  });

  it("calls openFile again when relPath changes", () => {
    const { rerender } = render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    rerender(<SkillFileEditor skill={mockSkill} relPath="/notes.md" />);
    expect(mockOpenFile).toHaveBeenCalledTimes(2);
    expect(mockOpenFile).toHaveBeenLastCalledWith("my-skill", "personal", null, "/notes.md");
  });

  it("shows loading state", () => {
    setStore({ isFileLoading: true, fileContent: null });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    expect(screen.queryByText("Loading file…")).toBeTruthy();
    expect(screen.queryByTestId("monaco-editor")).toBeNull();
  });

  it("shows error state", () => {
    setStore({ fileError: "File not found", fileContent: null });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    expect(screen.queryByText("File not found")).toBeTruthy();
    expect(screen.queryByTestId("monaco-editor")).toBeNull();
  });

  it("renders editor with file content", () => {
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    const editor = screen.getByTestId("monaco-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe("# Hello");
  });

  it("shows relPath in header", () => {
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    expect(screen.queryByText("/SKILL.md")).toBeTruthy();
  });

  it("shows dirty indicator when isFileDirty is true", () => {
    setStore({ isFileDirty: true });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    expect(screen.queryByLabelText("Unsaved changes")).toBeTruthy();
  });

  it("does not show dirty indicator when clean", () => {
    setStore({ isFileDirty: false });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    expect(screen.queryByLabelText("Unsaved changes")).toBeNull();
  });

  it("save button is disabled when not dirty", () => {
    setStore({ isFileDirty: false });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    const btn = screen.getByLabelText("Save file") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("save button is enabled when dirty", () => {
    setStore({ isFileDirty: true });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    const btn = screen.getByLabelText("Save file") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("save button shows 'Saving…' when isSavingFile", () => {
    setStore({ isFileDirty: true, isSavingFile: true });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    expect(screen.getByLabelText("Save file").textContent).toBe("Saving…");
  });

  it("clicking save calls saveFile and shows toast", async () => {
    mockSaveFile.mockResolvedValue(undefined);
    setStore({ isFileDirty: true, fileContent: "updated content" });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    fireEvent.click(screen.getByLabelText("Save file"));
    await vi.waitFor(() => {
      expect(mockSaveFile).toHaveBeenCalledWith(
        "my-skill", "personal", null, "/SKILL.md", "updated content"
      );
      expect(toast.success).toHaveBeenCalledWith("File saved", { duration: 2000 });
    });
  });

  it("shows error toast when save fails", async () => {
    mockSaveFile.mockRejectedValue({ message: "write error" });
    setStore({ isFileDirty: true, fileContent: "content" });
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    fireEvent.click(screen.getByLabelText("Save file"));
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("write error", { duration: Infinity });
    });
  });

  it("editor onChange calls setFileContent", () => {
    render(<SkillFileEditor skill={mockSkill} relPath="/SKILL.md" />);
    const editor = screen.getByTestId("monaco-editor");
    fireEvent.change(editor, { target: { value: "new content" } });
    expect(mockSetFileContent).toHaveBeenCalledWith("new content");
  });
});
