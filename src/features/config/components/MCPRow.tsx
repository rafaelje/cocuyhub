import { useState, useEffect } from "react";
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
import type { McpServerConfig, ToolTarget } from "@/types";

interface MCPRowProps {
  name: string;
  config: McpServerConfig;
  tool: ToolTarget;
  onToggle?: (name: string, enabled: boolean) => Promise<void>;
  onDelete?: (name: string) => Promise<void>;
}

export function MCPRow({ name, config, tool, onToggle, onDelete }: MCPRowProps) {
  const [optimisticEnabled, setOptimisticEnabled] = useState(config.disabled !== true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const toolLabel = tool === "code" ? "Code" : "Desktop";

  // Sync with config prop when it changes (e.g., after store reload)
  useEffect(() => {
    setOptimisticEnabled(config.disabled !== true);
  }, [config.disabled]);

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
      className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors"
    >
      <code className="flex-1 font-mono text-sm text-zinc-100 truncate">{name}</code>
      <Badge variant="secondary" className="shrink-0">
        Claude {toolLabel}
      </Badge>
      <Switch
        size="sm"
        checked={optimisticEnabled}
        onCheckedChange={handleCheckedChange}
        aria-label={`Enable ${name} in Claude ${toolLabel}`}
      />
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
  );
}
