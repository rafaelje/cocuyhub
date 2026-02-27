import type { Snapshot, ToolTarget } from "@/types";
import { formatRelativeTime, formatAbsoluteTime } from "@/lib/format-date";

interface SnapshotItemProps {
  snapshot: Snapshot;
  onRestore?: (id: string, tool: ToolTarget) => void;
}

export function SnapshotItem({ snapshot, onRestore }: SnapshotItemProps) {
  const displayName = snapshot.name || "auto";
  const relativeTime = formatRelativeTime(snapshot.timestamp);
  const absoluteTime = formatAbsoluteTime(snapshot.timestamp);

  return (
    <article className="flex items-center justify-between py-2 px-3 rounded hover:bg-zinc-800/50 gap-3">
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm text-zinc-100 truncate">{displayName}</span>
        <span className="text-xs text-zinc-500" title={absoluteTime}>
          {relativeTime}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
          {snapshot.isAuto ? "auto" : "manual"}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
          {snapshot.tool === "code" ? "Code" : "Desktop"}
        </span>
        <button
          onClick={() => onRestore?.(snapshot.id, snapshot.tool)}
          disabled={!onRestore}
          aria-label={`Restore snapshot from ${relativeTime}`}
          className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Restore
        </button>
      </div>
    </article>
  );
}
