import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeCommand } from "@/lib/ipc";
import { parseSnippet } from "@/lib/parse-snippet";
import { useAppStore } from "@/stores/useAppStore";
import { useConfigStore } from "@/stores/useConfigStore";
import type { ParsedMcp, ToolTarget } from "@/types";

type InstallTarget = "code" | "desktop" | "both";

export function SmartPasteBanner() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [parsedMcps, setParsedMcps] = useState<ParsedMcp[] | null>(null);
  const [parseSuccess, setParseSuccess] = useState(false);
  const [rawSnippet, setRawSnippet] = useState("");
  const [target, setTarget] = useState<InstallTarget>("code");
  const [isInstalling, setIsInstalling] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const dismissedContentRef = useRef<string | null>(null);
  // Ref mirrors rawSnippet state so dismiss() always reads current content
  // even when called from a stale closure (e.g., Escape keydown effect)
  const rawSnippetRef = useRef("");

  const configActiveTool = useAppStore((s) => s.configActiveTool);
  const { codeConfig, desktopConfig } = useConfigStore();

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;

      // Suppress if same content as last dismissed
      if (text === dismissedContentRef.current) return;

      // Only respond to JSON-like content (starts with '{')
      if (!text.trim().startsWith("{")) return;

      const result = parseSnippet(text);
      rawSnippetRef.current = text;
      setRawSnippet(text);
      setShowReview(false);
      setDuplicateWarning(null);
      setIsInstalling(false);
      setTarget(configActiveTool);

      if (result !== null) {
        setParsedMcps(result);
        setParseSuccess(true);
      } else {
        setParsedMcps(null);
        setParseSuccess(false);
      }

      setVisible(true);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [configActiveTool]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    dismissedContentRef.current = rawSnippetRef.current;
    setVisible(false);
    setShowReview(false);
    setDuplicateWarning(null);
  }

  async function handleAddMcp(force = false) {
    if (!parsedMcps || parsedMcps.length === 0) return;

    // Duplicate detection (skip if force=true/overwrite)
    if (!force) {
      const warnings: string[] = [];
      for (const mcp of parsedMcps) {
        if ((target === "code" || target === "both") && codeConfig?.mcpServers[mcp.name]) {
          warnings.push(`An MCP named "${mcp.name}" already exists in Claude Code.`);
        }
        if ((target === "desktop" || target === "both") && desktopConfig?.mcpServers[mcp.name]) {
          warnings.push(`An MCP named "${mcp.name}" already exists in Claude Desktop.`);
        }
      }
      if (warnings.length > 0) {
        setDuplicateWarning(warnings.join(" ") + " Overwrite?");
        return;
      }
    }

    setIsInstalling(true);
    setDuplicateWarning(null);

    const targets: ToolTarget[] = target === "both" ? ["code", "desktop"] : [target];
    const targetLabel =
      target === "both"
        ? "Claude Code and Claude Desktop"
        : target === "code"
        ? "Claude Code"
        : "Claude Desktop";

    try {
      for (const mcp of parsedMcps) {
        for (const t of targets) {
          await invokeCommand("mcp_add_from_snippet", {
            name: mcp.name,
            command: mcp.command,
            args: mcp.args,
            env: mcp.env ?? null,
            tool: t,
          });
          await useConfigStore.getState().reloadConfig(t);
        }
      }
      const names = parsedMcps.map((m) => m.name).join(", ");
      toast.success(`MCP ${names} added to ${targetLabel}`, { duration: 3000 });
      dismiss();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to add MCP: ${msg}`, { duration: Infinity });
    } finally {
      setIsInstalling(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="shrink-0 border-b border-amber-500/50 bg-amber-950/50 text-amber-400 text-sm"
    >
      {/* Banner row */}
      <div className="flex items-center gap-2 px-4 py-2">
        <span aria-hidden="true">📋</span>
        <span className="flex-1">Clipboard contains an MCP config — Add it?</span>
        <button
          onClick={() => setShowReview((prev) => !prev)}
          className="px-2 py-0.5 text-xs rounded border border-amber-500/50 hover:bg-amber-500/20 transition-colors"
        >
          Review
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss smart paste banner"
          className="text-amber-400 hover:text-amber-200 transition-colors leading-none"
        >
          ✕
        </button>
      </div>

      {/* Review panel */}
      {showReview && (
        <div className="px-4 pb-3 border-t border-amber-500/30">
          {parseSuccess && parsedMcps ? (
            <div className="space-y-2 pt-2">
              {parsedMcps.map((mcp) => (
                <McpPreviewCard key={mcp.name} mcp={mcp} />
              ))}

              {/* Target selector */}
              <div className="flex gap-1 pt-1">
                {(["code", "desktop", "both"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTarget(t);
                      setDuplicateWarning(null);
                    }}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded border transition-colors",
                      target === t
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-zinc-600 text-zinc-400 hover:bg-zinc-700"
                    )}
                  >
                    {t === "code"
                      ? "Claude Code"
                      : t === "desktop"
                      ? "Claude Desktop"
                      : "Both"}
                  </button>
                ))}
              </div>

              {/* Duplicate warning */}
              {duplicateWarning && (
                <div className="text-xs text-yellow-400 bg-yellow-950/40 border border-yellow-500/30 rounded p-2">
                  <p>{duplicateWarning}</p>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setDuplicateWarning(null)}
                      className="px-2 py-0.5 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleAddMcp(true)}
                      className="px-2 py-0.5 rounded border border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/20 transition-colors"
                    >
                      Overwrite
                    </button>
                  </div>
                </div>
              )}

              {/* Add MCP button */}
              <button
                onClick={() => handleAddMcp(false)}
                disabled={isInstalling}
                className="px-3 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
              >
                {isInstalling ? "Adding..." : "Add MCP"}
              </button>
            </div>
          ) : (
            <div className="pt-2 space-y-2">
              <p className="text-amber-300 font-medium">Could not parse as MCP config</p>
              <pre className="text-xs text-zinc-400 bg-zinc-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                {rawSnippet}
              </pre>
              <button
                onClick={() => navigate("/editor")}
                className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Open in Editor
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface McpPreviewCardProps {
  mcp: ParsedMcp;
}

function McpPreviewCard({ mcp }: McpPreviewCardProps) {
  return (
    <div className="rounded border border-amber-500/20 bg-zinc-900/50 p-2 text-xs space-y-1">
      <div className="font-medium text-amber-300">{mcp.name}</div>
      <div className="text-zinc-400">
        <span className="text-zinc-500">command: </span>
        {mcp.command}
      </div>
      {mcp.args.length > 0 && (
        <div className="text-zinc-400">
          <span className="text-zinc-500">args: </span>
          {mcp.args.join(" ")}
        </div>
      )}
      {mcp.env && Object.keys(mcp.env).length > 0 && (
        <div className="text-zinc-400">
          <span className="text-zinc-500">env: </span>
          {Object.keys(mcp.env).join(", ")}
        </div>
      )}
    </div>
  );
}
