import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { toast } from "sonner";
import { useSkillStore } from "@/stores/useSkillStore";
import type { SkillInfo } from "@/types";

interface SkillFileEditorProps {
  skill: SkillInfo;
  relPath: string;
}

export function SkillFileEditor({ skill, relPath }: SkillFileEditorProps) {
  const {
    fileContent,
    isFileLoading,
    fileError,
    isFileDirty,
    isSavingFile,
    openFile,
    saveFile,
    setFileContent,
  } = useSkillStore();

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    openFile(skill.slug, skill.location, skill.projectPath, relPath);
  }, [skill.slug, skill.location, skill.projectPath, relPath, openFile]);

  const ext = relPath.includes(".") ? relPath.split(".").pop()?.toLowerCase() : "";
  const language = (() => {
    switch (ext) {
      case "md": case "markdown": return "markdown";
      case "json": return "json";
      case "yaml": case "yml": return "yaml";
      case "toml": return "ini";  // Monaco has no TOML; ini is closest
      case "ts": case "tsx": return "typescript";
      case "js": case "jsx": return "javascript";
      case "sh": case "bash": return "shell";
      case "rs": return "rust";
      case "py": return "python";
      default: return "plaintext";
    }
  })();

  const handleSave = async () => {
    if (fileContent === null) return;
    try {
      await saveFile(skill.slug, skill.location, skill.projectPath, relPath, fileContent);
      toast.success("File saved", { duration: 2000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Save failed";
      toast.error(msg, { duration: Infinity });
    }
  };

  if (isFileLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-zinc-500">Loading file…</p>
      </div>
    );
  }

  if (fileError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-red-400 text-center px-8">{fileError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-zinc-400 truncate">{relPath}</span>
          {isFileDirty && (
            <span className="shrink-0 text-xs text-amber-400" aria-label="Unsaved changes">●</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!isFileDirty || isSavingFile}
          className="shrink-0 px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
          aria-label="Save file"
        >
          {isSavingFile ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={fileContent ?? ""}
          theme="vs-dark"
          onChange={(value) => setFileContent(value ?? "")}
          onMount={(editor) => { editorRef.current = editor; }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            renderWhitespace: "none",
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  );
}
