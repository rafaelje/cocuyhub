import { useState, useEffect } from "react";
import { useMetricsStore } from "@/stores/useMetricsStore";

type PlanKey = "pro" | "max5" | "max20";

const PLAN_PILLS: { key: PlanKey; label: string }[] = [
  { key: "pro",   label: "Pro" },
  { key: "max5",  label: "Max 5×" },
  { key: "max20", label: "Max 20×" },
];

const PLAN_LIMITS: Record<PlanKey, { messageLimit: number; tokenLimit: number }> = {
  pro:   { messageLimit: 250,   tokenLimit: 19_000  },
  max5:  { messageLimit: 1_000, tokenLimit: 88_000  },
  max20: { messageLimit: 2_000, tokenLimit: 220_000 },
};

const PLAN_LABELS: Record<string, string> = {
  pro: "Claude Pro",
  max5: "Claude Max (5×)",
  max20: "Claude Max (20×)",
  custom: "Custom",
};

function formatTimeToReset(endTime: string, now: number): string {
  const remaining = new Date(endTime).getTime() - now;
  if (isNaN(remaining) || remaining <= 0) return "Expired";
  const h = Math.floor(remaining / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function progressColor(pct: number): string {
  if (pct > 80) return "bg-red-500";
  if (pct > 50) return "bg-yellow-500";
  return "bg-emerald-500";
}

function strokeColor(pct: number): string {
  if (pct > 80) return "#ef4444";
  if (pct > 50) return "#eab308";
  return "#10b981";
}

function formatResetAt(endTime: string): string {
  const d = new Date(endTime);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function CircularProgress({ pct, size = 44 }: { pct: number; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(pct, 100) / 100);
  const color = strokeColor(pct);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3f3f46" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2} y={size / 2 + 3.5}
        textAnchor="middle"
        fill="#a1a1aa"
        fontSize={size * 0.22}
        fontFamily="inherit"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export function ClaudeMetricsView() {
  const payload = useMetricsStore((state) => state.payload);
  const isLoading = useMetricsStore((state) => state.isLoading);
  const [now, setNow] = useState(Date.now());
  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(() => {
    const saved = localStorage.getItem("metrics:selectedPlan");
    return (saved as PlanKey) ?? null;
  });

  // Mount: setup event listener, start watcher, fetch initial data
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const fn = await useMetricsStore.getState().setupListener();
      if (cancelled) {
        fn(); // component unmounted before promise resolved — immediately unlisten
      } else {
        unlisten = fn;
      }
    })();

    useMetricsStore.getState().startWatcher();
    useMetricsStore.getState().fetchMetrics();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Countdown: update local `now` every 60s — no Rust calls, no store re-renders
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !payload) {
    return (
      <div className="p-4">
        <p className="text-xs text-zinc-500 text-center py-8">Loading metrics...</p>
      </div>
    );
  }
  if (!isLoading && !payload) {
    return (
      <div className="p-4">
        <p className="text-xs text-zinc-500 text-center py-8">No Claude Code sessions found.</p>
      </div>
    );
  }
  if (!payload) return null;

  const session = payload.activeSession;

  // Use manually selected plan if set, otherwise fall back to auto-detected limits
  const activePlan = selectedPlan ?? (payload.detectedPlan !== "custom" ? payload.detectedPlan as PlanKey : null);
  const { messageLimit } = activePlan
    ? PLAN_LIMITS[activePlan]
    : payload.planLimits;

  // Circle shows time elapsed in the 5-hour session window
  const circlePct = session
    ? Math.min(
        ((now - new Date(session.startTime).getTime()) /
          (new Date(session.endTime).getTime() - new Date(session.startTime).getTime())) *
          100,
        100
      )
    : 0;

  return (
    <div className="p-4 overflow-y-auto h-full">
      <h1 className="text-sm font-semibold text-zinc-50 mb-1">Claude Metrics</h1>
      {payload.projectsPath && (
        <p className="text-xs text-zinc-600 mb-4 truncate" title={payload.projectsPath}>
          {payload.projectsPath}
        </p>
      )}

      {/* Active session card */}
      {session ? (
        <div className="border-l-2 border-emerald-500 bg-zinc-800/50 rounded p-4 mb-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-400 font-medium">● Active Session</span>
              <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                {PLAN_LABELS[payload.detectedPlan] ?? payload.detectedPlan}
              </span>
              {payload.planConfidence !== "unknown" && (
                <span className="text-xs text-zinc-500">({payload.planConfidence})</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <CircularProgress pct={circlePct} />
              <div className="text-right">
                {(() => {
                  const isExpiredLocally = now >= new Date(session.endTime).getTime();
                  if (isExpiredLocally) {
                    return (
                      <span className="flex items-center gap-2 text-xs text-zinc-400">
                        Session may have ended
                        <button
                          onClick={() => useMetricsStore.getState().fetchMetrics()}
                          className="text-emerald-400 hover:text-emerald-300 underline"
                        >
                          Refresh
                        </button>
                      </span>
                    );
                  }
                  return (
                    <>
                      <p className="text-xs text-zinc-400">Resets in {formatTimeToReset(session.endTime, now)}</p>
                      <p className="text-xs text-zinc-500">at {formatResetAt(session.endTime)}</p>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Plan selector pills */}
          <div className="flex gap-1.5 mb-3">
            {PLAN_PILLS.map(({ key, label }) => {
              const isActive = activePlan === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    const next = isActive ? null : key;
                    setSelectedPlan(next);
                    if (next) localStorage.setItem("metrics:selectedPlan", next);
                    else localStorage.removeItem("metrics:selectedPlan");
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    isActive
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                      : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Plan progress bars */}
          {activePlan ? (
            <div className="space-y-2 mb-3">
              {/* Messages */}
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Messages</span>
                  <span>{session.messageCount} / {messageLimit}</span>
                </div>
                <div className="h-1.5 bg-zinc-700 rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${progressColor(Math.min((session.messageCount / messageLimit) * 100, 100))}`}
                    style={{ width: `${Math.min((session.messageCount / messageLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 mb-3">Select a plan above to see usage limits</p>
          )}

          {/* Limit reached banner */}
          {session.limitReached && (
            <div className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded px-3 py-2 mt-2">
              ⚠️ Limit reached · Reset in {formatTimeToReset(session.endTime, now)}
            </div>
          )}

          {/* Token breakdown */}
          {session.totalTokens > 0 && (() => {
            const rows = [
              { label: "Input",        value: session.inputTokens,           color: "bg-blue-400"    },
              { label: "Output",       value: session.outputTokens,          color: "bg-emerald-500" },
              { label: "Cache read",   value: session.cacheReadTokens,       color: "bg-violet-400"  },
              { label: "Cache create", value: session.cacheCreationTokens,   color: "bg-amber-400"   },
            ].filter(r => r.value > 0);
            return (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-zinc-500 mb-2">Token breakdown</p>
                {rows.map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />
                        {label}
                      </span>
                      <span className="text-zinc-300 tabular-nums">{value.toLocaleString()}</span>
                    </div>
                ))}
                <p className="text-xs text-zinc-600 pt-1 text-right tabular-nums">
                  Total {session.totalTokens.toLocaleString()} tokens
                </p>
              </div>
            );
          })()}

          {/* Model distribution — across all scanned sessions (7 days) */}
          {Object.keys(payload.globalModelStats).length > 0 && (() => {
            const globalTotal = Object.values(payload.globalModelStats).reduce(
              (sum, s) => sum + s.inputTokens + s.outputTokens + s.cacheCreationTokens + s.cacheReadTokens, 0
            );
            return globalTotal > 0 ? (
              <div className="mt-3">
                <p className="text-xs text-zinc-500 mb-1">Model distribution <span className="text-zinc-600">(7 days)</span></p>
                <div className="space-y-1">
                  {Object.entries(payload.globalModelStats)
                    .sort((a, b) => b[1].entriesCount - a[1].entriesCount)
                    .map(([model, stats]) => {
                      const total = stats.inputTokens + stats.outputTokens + stats.cacheCreationTokens + stats.cacheReadTokens;
                      const pct = ((total / globalTotal) * 100).toFixed(1);
                      return (
                        <div key={model} className="flex justify-between text-xs text-zinc-400">
                          <span className="truncate max-w-[60%]">{model}</span>
                          <span>{total.toLocaleString()} ({pct}%)</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      ) : (
        <div className="border border-zinc-700 rounded p-4 mb-6 text-center">
          <p className="text-xs text-zinc-500">No active session · Start using Claude Code to see live metrics</p>
        </div>
      )}

    </div>
  );
}
