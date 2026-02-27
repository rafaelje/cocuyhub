import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import type { ToolTarget } from "@/types";

interface CopyConfigDialogProps {
  source: ToolTarget;
  destination: ToolTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopyConfigDialog({
  source,
  destination,
  open,
  onOpenChange,
}: CopyConfigDialogProps) {
  const [isCopying, setIsCopying] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) setIsCopying(false);
  }, [open]);

  const sourceLabel = source === "code" ? "Claude Code" : "Claude Desktop";
  const destLabel = destination === "code" ? "Claude Code" : "Claude Desktop";

  const handleCopy = async () => {
    setIsCopying(true);
    try {
      await invokeCommand("copy_config", { source, destination });
      await useConfigStore.getState().reloadConfig(destination);
      toast.success(`Config copied from ${sourceLabel} to ${destLabel}`, { duration: 3000 });
      onOpenChange(false);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to copy config: ${msg}`, { duration: Infinity });
      onOpenChange(false);
    } finally {
      setIsCopying(false);
    }
  };

  const handleCancel = () => {
    if (!isCopying) onOpenChange(false);
  };

  // Block dialog close (backdrop/Escape) while copying
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isCopying) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Copy MCP Configuration</DialogTitle>
          <DialogDescription>
            Copy all MCPs from {sourceLabel} to {destLabel}? This will replace the current{" "}
            {destLabel} MCP configuration. A snapshot will be created first.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button
            onClick={handleCancel}
            disabled={isCopying}
            className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={isCopying}
            className="px-3 py-1.5 text-sm bg-amber-700 hover:bg-amber-600 text-white transition-colors rounded disabled:opacity-50"
          >
            {isCopying ? "Copying..." : "Copy"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
