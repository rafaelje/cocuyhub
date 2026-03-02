import { useState, useRef, useEffect } from "react";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { toast } from "sonner";
import { useConfigStore } from "@/stores/useConfigStore";
import { useAppStore } from "@/stores/useAppStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { invokeCommand } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import type { ToolTarget } from "@/types";

const CLAUDE_CONFIG_SCHEMA = {
  type: "object",
  properties: {
    mcpServers: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["command"],
        properties: {
          command: {
            type: "string",
            description: "The executable command to run for this MCP server",
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Arguments to pass to the command",
          },
          env: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Environment variables for the MCP server process",
          },
          _description: {
            type: "string",
            description: "Optional human-readable description for this MCP server (CocuyHub metadata)",
          },
        },
      },
    },
  },
  additionalProperties: true,
};

export function JsonEditorPane() {
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const [errorCount, setErrorCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const handleSaveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const codeRaw = useConfigStore((state) => state.codeRaw);
  const desktopRaw = useConfigStore((state) => state.desktopRaw);

  const editorDirty = useAppStore((state) => state.editorDirty);
  const setEditorDirty = useAppStore((state) => state.setEditorDirty);
  const externalChangeWarning = useAppStore((state) => state.externalChangeWarning);
  const setExternalChangeWarning = useAppStore((state) => state.setExternalChangeWarning);
  const activeTool = useAppStore((state) => state.configActiveTool);
  const setConfigActiveTool = useAppStore((state) => state.setConfigActiveTool);

  const codePath = useSettingsStore((state) => state.codePath);
  const desktopPath = useSettingsStore((state) => state.desktopPath);

  const value = activeTool === "code" ? (codeRaw ?? "") : (desktopRaw ?? "");
  const path = activeTool === "code" ? codePath : desktopPath;

  async function handleSave() {
    if (errorCount > 0 || !editorDirty || isSaving || !path) return;
    const content = editorRef.current?.getValue() ?? "";
    setIsSaving(true);
    try {
      await invokeCommand("config_write_file", { path, content, tool: activeTool });
      setEditorDirty(false);
      setExternalChangeWarning(false);
      await useConfigStore.getState().reloadConfig(activeTool);
      toast.success("Config saved", { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to save: ${msg}`, { duration: Infinity });
    } finally {
      setIsSaving(false);
    }
  }

  handleSaveRef.current = handleSave;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleTabChange(tool: ToolTarget) {
    setConfigActiveTool(tool);
    setPosition({ line: 1, column: 1 });
    setErrorCount(0);
    setWarningCount(0);
    setEditorDirty(false);
    setExternalChangeWarning(false);
  }

  function handleEditorMount(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco
  ) {
    editorRef.current = editor;
    (monaco.languages.json as unknown as { jsonDefaults: { setDiagnosticsOptions: (opts: unknown) => void } }).jsonDefaults.setDiagnosticsOptions({
      validate: true,
      enableSchemaRequest: false,
      schemas: [
        {
          uri: "https://cocuyhub/claude-config-schema.json",
          fileMatch: ["*"],
          schema: CLAUDE_CONFIG_SCHEMA,
        },
      ],
    });
    editor.onDidChangeCursorPosition((e) => {
      setPosition({ line: e.position.lineNumber, column: e.position.column });
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveRef.current();
    });
  }

  function handleValidate(markers: Monaco.editor.IMarker[]) {
    setErrorCount(markers.filter((m) => m.severity === 8).length);
    setWarningCount(markers.filter((m) => m.severity === 4).length);
  }

  return (
    <div className="flex flex-col h-full">
      <div role="tablist" className="flex border-b border-zinc-800 px-4">
        {(["code", "desktop"] as ToolTarget[]).map((tool) => (
          <button
            key={tool}
            role="tab"
            onClick={() => handleTabChange(tool)}
            aria-selected={activeTool === tool}
            className={cn(
              "px-3 py-2 text-sm border-b-2 transition-colors",
              activeTool === tool
                ? "border-emerald-500 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            {tool === "code" ? "Claude Code" : "Claude Desktop"}
          </button>
        ))}
        <button
          onClick={handleSave}
          disabled={errorCount > 0 || !editorDirty || isSaving || !path}
          className="ml-auto px-3 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
        >
          {!path ? "No path" : isSaving ? "Saving..." : "Save"}
        </button>
      </div>

      {editorDirty && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-1.5 text-xs bg-blue-950/50 border-b border-blue-500/50 text-blue-400 shrink-0"
        >
          Unsaved changes — ⌘S to save
        </div>
      )}

      {externalChangeWarning && editorDirty && (
        <div
          role="alert"
          className="px-4 py-1.5 text-xs bg-amber-950/50 border-b border-amber-500/50 text-amber-400 shrink-0 flex items-center justify-between"
        >
          <span>File modified externally — your unsaved changes may conflict</span>
          <button
            onClick={() => setExternalChangeWarning(false)}
            aria-label="Dismiss external change warning"
            className="text-amber-400 hover:text-amber-200 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <Editor
          key={activeTool}
          height="100%"
          defaultLanguage="json"
          value={value}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "off",
          }}
          loading={
            <div
              className="h-full bg-zinc-950 animate-pulse"
              aria-label="Loading editor..."
            />
          }
          onMount={handleEditorMount}
          onValidate={handleValidate}
          onChange={() => setEditorDirty(true)}
        />
      </div>

      <div className="flex items-center justify-between px-4 py-1 text-xs border-t border-zinc-800 bg-zinc-900 text-zinc-500">
        <span>
          Ln {position.line}, Col {position.column}
        </span>
        {errorCount === 0 && warningCount === 0 ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span
              className="size-1.5 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            Valid JSON
          </span>
        ) : errorCount > 0 && warningCount === 0 ? (
          <span className="flex items-center gap-1.5 text-red-400">
            <span
              className="size-1.5 rounded-full bg-red-500"
              aria-hidden="true"
            />
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        ) : errorCount === 0 && warningCount > 0 ? (
          <span className="flex items-center gap-1.5 text-yellow-400">
            <span
              className="size-1.5 rounded-full bg-yellow-500"
              aria-hidden="true"
            />
            {warningCount} warning{warningCount !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-red-400">
            <span
              className="size-1.5 rounded-full bg-red-500"
              aria-hidden="true"
            />
            {errorCount} error{errorCount !== 1 ? "s" : ""},{" "}
            {warningCount} warning{warningCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
