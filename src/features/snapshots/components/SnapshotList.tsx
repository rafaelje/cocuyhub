import { ScrollArea } from "@/components/ui/scroll-area";
import { SnapshotItem } from "./SnapshotItem";
import { getDateGroup } from "@/lib/format-date";
import type { Snapshot, ToolTarget } from "@/types";

type DateGroup = "Today" | "Yesterday" | "This week" | "Older";
const GROUP_ORDER: DateGroup[] = ["Today", "Yesterday", "This week", "Older"];

interface SnapshotListProps {
  snapshots: Snapshot[];
  onRestore?: (id: string, tool: ToolTarget) => void;
}

export function SnapshotList({ snapshots, onRestore }: SnapshotListProps) {
  const groups = GROUP_ORDER.reduce<Record<DateGroup, Snapshot[]>>(
    (acc, g) => ({ ...acc, [g]: [] }),
    {} as Record<DateGroup, Snapshot[]>
  );

  for (const s of snapshots) {
    groups[getDateGroup(s.timestamp)].push(s);
  }

  return (
    <ScrollArea className="max-h-[calc(100vh-180px)]">
      {GROUP_ORDER.filter((g) => groups[g].length > 0).map((group) => (
        <section key={group} aria-label={group}>
          <h2 className="text-xs font-medium text-zinc-500 px-3 py-1.5 uppercase tracking-wide">
            {group}
          </h2>
          <div className="flex flex-col">
            {groups[group].map((snapshot) => (
              <SnapshotItem
                key={snapshot.id}
                snapshot={snapshot}
                onRestore={onRestore}
              />
            ))}
          </div>
        </section>
      ))}
    </ScrollArea>
  );
}
