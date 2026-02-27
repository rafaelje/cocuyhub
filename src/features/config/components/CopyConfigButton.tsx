import { useState } from "react";
import type { ToolTarget } from "@/types";
import { CopyConfigDialog } from "./CopyConfigDialog";

interface CopyConfigButtonProps {
  source: ToolTarget;
  destination: ToolTarget;
  hidden: boolean;
}

export function CopyConfigButton({ source, destination, hidden }: CopyConfigButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (hidden) return null;

  const destLabel = destination === "code" ? "Claude Code" : "Claude Desktop";

  return (
    <>
      <div className="flex justify-end px-4 py-1.5 shrink-0">
        <button
          onClick={() => setDialogOpen(true)}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700 hover:border-zinc-500 rounded px-2 py-1"
        >
          Copy to {destLabel}
        </button>
      </div>
      <CopyConfigDialog
        source={source}
        destination={destination}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
