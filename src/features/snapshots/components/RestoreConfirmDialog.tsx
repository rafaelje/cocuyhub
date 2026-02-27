import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Snapshot } from "@/types";
import { formatRelativeTime, formatAbsoluteTime } from "@/lib/format-date";

interface RestoreConfirmDialogProps {
  snapshot: Snapshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function RestoreConfirmDialog({
  snapshot,
  open,
  onOpenChange,
  onConfirm,
}: RestoreConfirmDialogProps) {
  const [isRestoring, setIsRestoring] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) setIsRestoring(false);
  }, [open]);

  if (!snapshot) return null;

  const displayName = snapshot.name || "auto";
  const toolLabel = snapshot.tool === "code" ? "Claude Code" : "Claude Desktop";
  const relativeTime = formatRelativeTime(snapshot.timestamp);
  const absoluteTime = formatAbsoluteTime(snapshot.timestamp);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await onConfirm();
    } finally {
      setIsRestoring(false);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    if (!isRestoring) onOpenChange(false);
  };

  // Block dialog close from backdrop/Escape while restoring
  const handleOpenChange = (open: boolean) => {
    if (!open && isRestoring) return;
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Restore Snapshot</DialogTitle>
          <DialogDescription>
            Restore your {toolLabel} configuration to this snapshot.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 p-3 bg-zinc-800 rounded border border-zinc-700">
            <span className="text-sm text-zinc-100 truncate">{displayName}</span>
            <span className="text-xs text-zinc-500" title={absoluteTime}>
              {relativeTime}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-700 self-start">
              {toolLabel}
            </span>
          </div>
          <p className="text-xs text-amber-400">
            This will overwrite your current {toolLabel} configuration. A snapshot of the current
            state will be created first.
          </p>
        </div>

        <DialogFooter>
          <button
            onClick={handleCancel}
            disabled={isRestoring}
            className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleRestore}
            disabled={isRestoring}
            className="px-3 py-1.5 text-sm bg-amber-700 hover:bg-amber-600 text-white transition-colors rounded disabled:opacity-50"
          >
            {isRestoring ? "Restoring..." : "Restore"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
