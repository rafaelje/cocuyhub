import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ToolTarget } from "@/types";

interface ManualSnapshotFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, tools: ToolTarget[]) => Promise<void>;
}

type ToolSelection = "code" | "desktop" | "both";

export function ManualSnapshotForm({
  open,
  onOpenChange,
  onSubmit,
}: ManualSnapshotFormProps) {
  const [name, setName] = useState("");
  const [selectedTool, setSelectedTool] = useState<ToolSelection>("both");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setSelectedTool("both");
    }
  }, [open]);

  const handleCreate = async () => {
    const tools: ToolTarget[] =
      selectedTool === "both" ? ["code", "desktop"] : [selectedTool];
    setIsSubmitting(true);
    try {
      await onSubmit(name, tools);
    } finally {
      setIsSubmitting(false);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    if (!isSubmitting) onOpenChange(false);
  };

  const toolOptions: { value: ToolSelection; label: string }[] = [
    { value: "code", label: "Claude Code" },
    { value: "desktop", label: "Claude Desktop" },
    { value: "both", label: "Both" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Create Snapshot</DialogTitle>
          <DialogDescription>
            Save a named restore point of your current configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="snapshot-name" className="text-xs text-zinc-400">
              Name (optional)
            </label>
            <div className="relative">
              <input
                id="snapshot-name"
                type="text"
                value={name}
                maxLength={64}
                onChange={(e) => setName(e.target.value.slice(0, 64))}
                placeholder='e.g. "Before adding GitHub MCP"'
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              {name.length >= 50 && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                  {name.length}/64
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {toolOptions.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSelectedTool(value)}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  selectedTool === value
                    ? "bg-zinc-700 border-zinc-500 text-zinc-100"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white transition-colors rounded disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Snapshot"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
