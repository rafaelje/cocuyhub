import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeCommand } from "@/lib/ipc";
import { parseSnippet } from "@/lib/parse-snippet";
import { useAppStore } from "@/stores/useAppStore";
import { useConfigStore } from "@/stores/useConfigStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ParsedMcp, ToolTarget } from "@/types";

type InstallTarget = "code" | "desktop" | "both" | "project";

export function SmartPasteBanner() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [parsedMcps, setParsedMcps] = useState<ParsedMcp[] | null>(null);
  const [parseSuccess, setParseSuccess] = useState(false);
  const [rawSnippet, setRawSnippet] = useState("");
  const [target, setTarget] = useState<InstallTarget>("code");
  const [isInstalling, setIsInstalling] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const dismissedContentRef = useRef<string | null>(null);
  const rawSnippetRef = useRef("");

  const configActiveTool = useAppStore((s) => s.configActiveTool);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);
  const { codeConfig, desktopConfig } = useConfigStore();

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      if (text === dismissedContentRef.current) return;
      if (!text.trim().startsWith("{")) return;

      const result = parseSnippet(text);
      rawSnippetRef.current = text;
      setRawSnippet(text);
      setDuplicateWarning(null);
      setIsInstalling(false);
      setTarget(configActiveTool === "code" && activeProjectPath !== null ? "project" : configActiveTool);

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
  }, [configActiveTool, activeProjectPath]);

  function dismiss() {
    dismissedContentRef.current = rawSnippetRef.current;
    setVisible(false);
    setDuplicateWarning(null);
  }

  async function handleAddMcp(force = false) {
    if (!parsedMcps || parsedMcps.length === 0) return;

    if (!force) {
      const warnings: string[] = [];
      for (const mcp of parsedMcps) {
        if ((target === "code" || target === "both") && codeConfig?.mcpServers[mcp.name]) {
          warnings.push(`An MCP named "${mcp.name}" already exists in Claude Code.`);
        }
        if ((target === "desktop" || target === "both") && desktopConfig?.mcpServers[mcp.name]) {
          warnings.push(`An MCP named "${mcp.name}" already exists in Claude Desktop.`);
        }
        if (target === "project" && activeProjectPath != null && codeConfig?.projects?.[activeProjectPath]?.mcpServers[mcp.name]) {
          const basename = activeProjectPath.split("/").pop() ?? activeProjectPath;
          warnings.push(`An MCP named "${mcp.name}" already exists in Project: ${basename}.`);
        }
      }
      if (warnings.length > 0) {
        setDuplicateWarning(warnings.join(" ") + " Overwrite?");
        return;
      }
    }

    setIsInstalling(true);
    setDuplicateWarning(null);

    const projectBasename = activeProjectPath?.split("/").pop() ?? activeProjectPath ?? "";
    const targetLabel =
      target === "both"
        ? "Claude Code and Claude Desktop"
        : target === "code"
        ? "Claude Code"
        : target === "desktop"
        ? "Claude Desktop"
        : `Project: ${projectBasename}`;

    try {
      if (target === "project" && activeProjectPath != null) {
        for (const mcp of parsedMcps) {
          await invokeCommand("project_mcp_add", {
            name: mcp.name,
            command: mcp.command,
            args: mcp.args,
            env: mcp.env ?? null,
            projectPath: activeProjectPath,
          });
          await useConfigStore.getState().reloadConfig("code");
        }
      } else {
        const targets: ToolTarget[] = target === "both" ? ["code", "desktop"] : [target as ToolTarget];
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

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">📋</span>
            MCP detected in clipboard
          </DialogTitle>
          <DialogDescription>
            {parseSuccess
              ? "Review the MCP below and choose where to install it."
              : "The clipboard content could not be parsed as an MCP config."}
          </DialogDescription>
        </DialogHeader>

        {parseSuccess && parsedMcps ? (
          <div className="space-y-3">
            {/* MCP preview cards */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {parsedMcps.map((mcp) => (
                <McpPreviewCard key={mcp.name} mcp={mcp} />
              ))}
            </div>

            {/* Target selector */}
            <div>
              <p className="text-xs text-zinc-400 mb-1.5">Install to</p>
              <div className="flex flex-wrap gap-1.5">
                {(["code", "desktop", "both"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTarget(t); setDuplicateWarning(null); }}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded border transition-colors",
                      target === t
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-zinc-600 text-zinc-400 hover:bg-zinc-700"
                    )}
                  >
                    {t === "code" ? "Claude Code" : t === "desktop" ? "Claude Desktop" : "Both"}
                  </button>
                ))}
                {configActiveTool === "code" && activeProjectPath != null && (
                  <button
                    onClick={() => { setTarget("project"); setDuplicateWarning(null); }}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded border transition-colors",
                      target === "project"
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-zinc-600 text-zinc-400 hover:bg-zinc-700"
                    )}
                  >
                    Project: {activeProjectPath.split("/").pop() ?? activeProjectPath}
                  </button>
                )}
              </div>
            </div>

            {/* Duplicate warning */}
            {duplicateWarning && (
              <div className="text-xs text-yellow-400 bg-yellow-950/40 border border-yellow-500/30 rounded p-2 space-y-1.5">
                <p>{duplicateWarning}</p>
                <div className="flex gap-2">
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
          </div>
        ) : (
          <div className="space-y-2">
            <pre className="text-xs text-zinc-400 bg-zinc-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
              {rawSnippet}
            </pre>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!parseSuccess && (
            <button
              onClick={() => { dismiss(); navigate("/editor"); }}
              className="px-3 py-1.5 text-sm rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Open in Editor
            </button>
          )}
          <button
            onClick={dismiss}
            className="px-3 py-1.5 text-sm rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            Cancel
          </button>
          {parseSuccess && (
            <button
              onClick={() => handleAddMcp(false)}
              disabled={isInstalling}
              className="px-3 py-1.5 text-sm rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
            >
              {isInstalling ? "Adding…" : "Add MCP"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface McpPreviewCardProps {
  mcp: ParsedMcp;
}

function McpPreviewCard({ mcp }: McpPreviewCardProps) {
  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 p-2 text-xs space-y-1">
      <div className="font-medium text-zinc-100">{mcp.name}</div>
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
