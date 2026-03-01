import { useState, useMemo } from "react";

const BUILTIN = new Set([
  "Read", "Bash", "Edit", "Write", "Grep", "Glob", "Agent",
  "WebFetch", "WebSearch", "NotebookEdit", "EnterPlanMode",
  "ExitPlanMode", "AskUserQuestion",
]);

type Category = "builtin" | "mcp" | "other";

function classify(name: string): Category {
  if (name.startsWith("mcp__")) return "mcp";
  if (BUILTIN.has(name)) return "builtin";
  return "other";
}

function formatMcpName(name: string): string {
  // mcp__chrome-devtools__click → chrome-devtools / click
  const parts = name.replace(/^mcp__/, "").split("__");
  return parts.join(" / ");
}

function formatToolName(name: string): string {
  if (name.startsWith("mcp__")) return formatMcpName(name);
  return name;
}

interface ToolEntry {
  name: string;
  count: number;
  category: Category;
}

const CATEGORY_CONFIG: Record<Category, { label: string; border: string; badge: string }> = {
  builtin: { label: "Built-in Tools", border: "border-l-blue-500", badge: "bg-blue-500/20 text-blue-400" },
  mcp:     { label: "MCP Tools",      border: "border-l-violet-500", badge: "bg-violet-500/20 text-violet-400" },
  other:   { label: "Other",          border: "border-l-amber-500", badge: "bg-amber-500/20 text-amber-400" },
};

interface ToolUsageSectionProps {
  toolUsage: Record<string, number>;
}

export function ToolUsageSection({ toolUsage }: ToolUsageSectionProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<Category, boolean>>({
    builtin: false,
    mcp: false,
    other: false,
  });

  const entries: ToolEntry[] = useMemo(
    () =>
      Object.entries(toolUsage)
        .map(([name, count]) => ({ name, count, category: classify(name) }))
        .sort((a, b) => b.count - a.count),
    [toolUsage],
  );

  const totalTools = entries.length;
  if (totalTools === 0) return null;

  const top10 = entries.slice(0, 10);
  const maxCount = top10[0]?.count ?? 1;

  const filtered = search.trim()
    ? entries.filter((e) =>
        formatToolName(e.name).toLowerCase().includes(search.toLowerCase()),
      )
    : entries;

  const grouped = filtered.reduce<Record<Category, ToolEntry[]>>(
    (acc, e) => {
      acc[e.category].push(e);
      return acc;
    },
    { builtin: [], mcp: [], other: [] },
  );

  const skillCount = toolUsage["Skill"] ?? 0;

  const toggle = (cat: Category) =>
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <div className="border border-zinc-700 rounded p-4 mb-6">
      <h2 className="text-xs font-semibold text-zinc-300 mb-3">
        Tool Usage <span className="text-zinc-600 font-normal">(7 days)</span>
      </h2>

      {/* Skill callout */}
      {skillCount > 0 && (
        <div className="text-xs text-violet-400 bg-violet-400/10 border border-violet-400/20 rounded px-3 py-2 mb-3">
          Skills invoked: {skillCount} {skillCount === 1 ? "time" : "times"}
        </div>
      )}

      {/* Top 10 bar chart */}
      <div className="space-y-1.5 mb-4">
        {top10.map(({ name, count }) => {
          const pct = (count / maxCount) * 100;
          return (
            <div key={name} className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 w-28 truncate text-right" title={name}>
                {formatToolName(name)}
              </span>
              <div className="flex-1 h-3 bg-zinc-800 rounded overflow-hidden">
                <div
                  className="h-full bg-emerald-500/70 rounded"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 w-10 text-right tabular-nums">
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Search filter — only if > 15 unique tools */}
      {totalTools > 15 && (
        <input
          type="text"
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 placeholder-zinc-600 mb-3 outline-none focus:border-zinc-500"
        />
      )}

      {/* Grouped collapsible sections */}
      <div className="space-y-2">
        {(["builtin", "mcp", "other"] as Category[]).map((cat) => {
          const items = grouped[cat];
          if (items.length === 0) return null;
          const cfg = CATEGORY_CONFIG[cat];
          const totalInvocations = items.reduce((s, e) => s + e.count, 0);
          const isOpen = expanded[cat];

          return (
            <div key={cat} className={`border-l-2 ${cfg.border} rounded bg-zinc-800/30`}>
              <button
                onClick={() => toggle(cat)}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{isOpen ? "▾" : "▸"}</span>
                  <span className="text-xs text-zinc-300 font-medium">{cfg.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${cfg.badge}`}>
                    {items.length}
                  </span>
                </div>
                <span className="text-xs text-zinc-500 tabular-nums">
                  {totalInvocations.toLocaleString()} calls
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-2 space-y-1">
                  {items.map(({ name, count }) => (
                    <div key={name} className="flex justify-between text-xs">
                      <span className="text-zinc-400 truncate max-w-[70%]" title={name}>
                        {formatToolName(name)}
                      </span>
                      <span className="text-zinc-500 tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
