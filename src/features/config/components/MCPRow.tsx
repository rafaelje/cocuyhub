import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { McpServerConfig, ToolTarget } from "@/types";

// F13: co-presence constraint — existingNames is required when onRename is provided
type RenameProps =
  | { onRename: (oldName: string, newName: string) => Promise<void>; existingNames: string[] }
  | { onRename?: never; existingNames?: never };

type MCPRowProps = {
  name: string;
  config: McpServerConfig;
  tool: ToolTarget;
  enabled: boolean;
  onToggle?: (name: string, enabled: boolean) => Promise<void>;
  onDelete?: (name: string) => Promise<void>;
  onCopyToOther?: (name: string, config: McpServerConfig) => Promise<void>;
  onCopyToGlobal?: (name: string, config: McpServerConfig) => Promise<void>;
  onCopyToDesktop?: (name: string, config: McpServerConfig) => Promise<void>;
  onDescriptionChange?: (name: string, description: string | null) => Promise<void>;
} & RenameProps;

export function MCPRow({ name, config, tool, enabled, onToggle, onDelete, onCopyToOther, onCopyToGlobal, onCopyToDesktop, onRename, existingNames, onDescriptionChange }: MCPRowProps) {
  const [optimisticEnabled, setOptimisticEnabled] = useState(enabled);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState(config._description ?? "");
  // F1: tracks if Escape was pressed to prevent subsequent blur from committing
  const cancelledRef = useRef(false);
  const descriptionCancelledRef = useRef(false);
  const toolLabel = tool === "code" ? "Code" : "Desktop";
  const otherToolLabel = tool === "code" ? "Desktop" : "Code";

  const handleCopyJson = async () => {
    const snippet = JSON.stringify({ mcpServers: { [name]: config } }, null, 2);
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("JSON copied to clipboard", { duration: 3000 });
    } catch {
      toast.error("Failed to copy to clipboard", { duration: Infinity });
    }
  };

  // Sync with enabled prop when it changes (e.g., after store reload)
  useEffect(() => {
    setOptimisticEnabled(enabled);
  }, [enabled]);

  // Sync draftName if name changes from parent (e.g., after successful rename + reload)
  useEffect(() => {
    setDraftName(name);
  }, [name]);

  // Sync draftDescription if config._description changes from parent
  useEffect(() => {
    setDraftDescription(config._description ?? "");
  }, [config._description]);

  const handleCommit = async () => {
    // F1: bail if Escape already cancelled this edit cycle
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    // F2: runtime guard — editing is only activated when onRename is defined, but guard defensively
    if (!onRename) {
      setEditing(false);
      return;
    }
    if (draftName === name) {
      setEditing(false);
      return;
    }
    if (!draftName || !/^[a-zA-Z0-9_-]+$/.test(draftName)) {
      toast.error("Name can only contain letters, numbers, hyphens and underscores", { duration: Infinity });
      return;
    }
    const otherNames = existingNames?.filter((n) => n !== name) ?? [];
    if (otherNames.includes(draftName)) {
      toast.error("An MCP with that name already exists", { duration: Infinity });
      return;
    }
    // F5: close editing only on success; keep it open on error so user can retry
    try {
      await onRename(name, draftName);
      setEditing(false);
    } catch {
      // McpList re-throws after showing its error toast — keep editing open for retry
    }
  };

  const handleCancel = () => {
    // F1: set flag before state update so the subsequent blur sees it
    cancelledRef.current = true;
    setEditing(false);
    setDraftName(name);
  };

  const handleDescriptionCommit = async () => {
    if (descriptionCancelledRef.current) {
      descriptionCancelledRef.current = false;
      return;
    }
    if (!onDescriptionChange) { setDescriptionEditing(false); return; }
    if (draftDescription === (config._description ?? "")) { setDescriptionEditing(false); return; }
    try {
      await onDescriptionChange(name, draftDescription.trim() || null);
      setDescriptionEditing(false);
    } catch {
      // keep editing open for retry
    }
  };

  const handleDescriptionCancel = () => {
    descriptionCancelledRef.current = true;
    setDescriptionEditing(false);
    setDraftDescription(config._description ?? "");
  };

  const handleCheckedChange = async (newChecked: boolean) => {
    if (!onToggle) return;
    const prevEnabled = optimisticEnabled;
    setOptimisticEnabled(newChecked); // Optimistic update
    try {
      await onToggle(name, newChecked);
    } catch {
      setOptimisticEnabled(prevEnabled); // Rollback on error
    }
  };

  const handleConfirmDelete = async () => {
    setDialogOpen(false);
    await onDelete!(name);
  };

  return (
    <div
      role="article"
      className="flex flex-col px-4 py-3 border-b border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors"
    >
      {/* Main row */}
      <div className="flex items-center gap-3">
        {editing ? (
          <input
            className="flex-1 font-mono text-sm text-zinc-100 bg-transparent border-b border-zinc-500 outline-none truncate"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleCommit(); }
              if (e.key === "Escape") handleCancel();
            }}
            onBlur={handleCommit}
            autoFocus
            aria-label={`Rename ${name}`}
          />
        ) : (
          <code
            className="flex-1 font-mono text-sm text-zinc-100 truncate"
            onDoubleClick={() => { if (onRename) { setEditing(true); setDraftName(name); } }}
          >
            {name}
          </code>
        )}
        <Badge variant="secondary" className="shrink-0">
          Claude {toolLabel}
        </Badge>
        <Switch
          size="sm"
          checked={optimisticEnabled}
          onCheckedChange={handleCheckedChange}
          aria-label={`Enable ${name} in Claude ${toolLabel}`}
        />
        {onCopyToOther && (
          <button
            onClick={() => onCopyToOther(name, config)}
            aria-label={`Copy ${name} to Claude ${otherToolLabel}`}
            className="ml-1 p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
          >
            ⇢
          </button>
        )}
        {onCopyToGlobal && (
          <button
            onClick={() => onCopyToGlobal(name, config)}
            aria-label={`Copy ${name} to Global`}
            className="ml-1 p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
          >
            ⇢
          </button>
        )}
        {onCopyToDesktop && (
          <button
            onClick={() => onCopyToDesktop(name, config)}
            aria-label={`Copy ${name} to Claude Desktop`}
            className="ml-1 p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
          >
            ⇢
          </button>
        )}
        <button
          onClick={handleCopyJson}
          aria-label={`Copy JSON for ${name}`}
          className="ml-1 p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
        >
          ⎘
        </button>
        {onDelete && (
          <>
            <button
              onClick={() => setDialogOpen(true)}
              aria-label={`Remove ${name} from Claude ${toolLabel}`}
              className="ml-1 p-1 text-zinc-500 hover:text-red-400 transition-colors rounded"
            >
              ✕
            </button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>Remove MCP?</DialogTitle>
                  <DialogDescription>
                    Remove <strong>{name}</strong> from Claude {toolLabel}? This cannot be undone
                    (but a snapshot will be created first).
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <button className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500">
                      Cancel
                    </button>
                  </DialogClose>
                  <button
                    onClick={handleConfirmDelete}
                    className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white transition-colors rounded"
                  >
                    Remove
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
      {/* Description line */}
      {descriptionEditing ? (
        <input
          className="mt-0.5 w-full text-xs text-zinc-300 bg-transparent border-b border-zinc-500 outline-none"
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleDescriptionCommit(); }
            if (e.key === "Escape") handleDescriptionCancel();
          }}
          onBlur={handleDescriptionCommit}
          autoFocus
          aria-label={`Description for ${name}`}
          placeholder="Add description…"
        />
      ) : (
        <span
          className={cn(
            "mt-0.5 text-xs cursor-text",
            config._description ? "text-zinc-400" : "text-zinc-600"
          )}
          onClick={() => { if (onDescriptionChange) { setDescriptionEditing(true); setDraftDescription(config._description ?? ""); } }}
          aria-label={config._description ? `Description: ${config._description}` : `Add description for ${name}`}
        >
          {config._description || (onDescriptionChange ? "Add description…" : "")}
        </span>
      )}
    </div>
  );
}
