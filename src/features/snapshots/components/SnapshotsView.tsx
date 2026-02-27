import { useState, useEffect } from "react";
import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { useSnapshotStore } from "@/stores/useSnapshotStore";
import { useAppStore } from "@/stores/useAppStore";
import type { Snapshot, ToolTarget } from "@/types";
import { ManualSnapshotForm } from "./ManualSnapshotForm";
import { SnapshotList } from "./SnapshotList";
import { RestoreConfirmDialog } from "./RestoreConfirmDialog";

type ToolFilter = "all" | "code" | "desktop";

const TOOL_FILTERS: { value: ToolFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "code", label: "Code" },
  { value: "desktop", label: "Desktop" },
];

export function SnapshotsView() {
  const [selectedTool, setSelectedTool] = useState<ToolFilter>("all");
  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null);

  const codeConfig = useConfigStore((state) => state.codeConfig);
  const desktopConfig = useConfigStore((state) => state.desktopConfig);
  const snapshots = useSnapshotStore((state) => state.snapshots);
  const isLoading = useSnapshotStore((state) => state.isLoading);
  const snapshotFormOpen = useAppStore((state) => state.snapshotFormOpen);
  const setSnapshotFormOpen = useAppStore((state) => state.setSnapshotFormOpen);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    useSnapshotStore.getState().setupListener().then((fn) => {
      unlisten = fn;
    });
    useSnapshotStore.getState().fetchSnapshots();
    return () => unlisten?.();
  }, []);

  const filteredSnapshots = snapshots.filter(
    (s) => selectedTool === "all" || s.tool === selectedTool
  );

  const handleRestore = (id: string, _tool: ToolTarget) => {
    const found = snapshots.find((s) => s.id === id);
    if (found) setRestoreTarget(found);
  };

  const handleConfirmRestore = async (): Promise<void> => {
    if (!restoreTarget) return;
    const displayName = restoreTarget.name || "auto";
    try {
      await invokeCommand("snapshot_restore", {
        snapshotId: restoreTarget.id,
        tool: restoreTarget.tool,
      });
      await useConfigStore.getState().reloadConfig(restoreTarget.tool);
      toast.success(`Restored: ${displayName}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to restore: ${msg}`, { duration: Infinity });
    }
  };

  const handleCreate = async (name: string, tools: ToolTarget[]): Promise<void> => {
    const effectiveName = name.trim() || `manual-${new Date().toISOString()}`;

    for (const tool of tools) {
      const config = tool === "code" ? codeConfig : desktopConfig;

      if (!config) {
        const label = tool === "code" ? "Code" : "Desktop";
        toast.error(`Cannot create snapshot: Claude ${label} config not loaded`, {
          duration: Infinity,
        });
        continue;
      }

      try {
        const content = JSON.stringify(config, null, 2);
        await invokeCommand("snapshot_create", {
          name: effectiveName,
          tool,
          isAuto: false,
          content,
        });
        toast.success(`Snapshot created: ${effectiveName}`, { duration: 3000 });
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? "Unknown error";
        toast.error(`Failed to create snapshot: ${msg}`, { duration: Infinity });
      }
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-medium text-zinc-400">Snapshots</h1>
        <button
          onClick={() => setSnapshotFormOpen(true)}
          className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-600 rounded transition-colors"
        >
          Create Snapshot
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {TOOL_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setSelectedTool(value)}
            aria-pressed={selectedTool === value}
            className={`px-3 py-1 text-xs rounded border transition-colors ${
              selectedTool === value
                ? "bg-zinc-700 border-zinc-500 text-zinc-100"
                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!isLoading && filteredSnapshots.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-8">
          No snapshots yet. Snapshots are created automatically before each change.
        </p>
      ) : (
        <SnapshotList snapshots={filteredSnapshots} onRestore={handleRestore} />
      )}

      <ManualSnapshotForm
        open={snapshotFormOpen}
        onOpenChange={setSnapshotFormOpen}
        onSubmit={handleCreate}
      />

      <RestoreConfirmDialog
        snapshot={restoreTarget}
        open={restoreTarget !== null}
        onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}
        onConfirm={handleConfirmRestore}
      />
    </div>
  );
}
