import { useState, useEffect } from "react";
import { useAppStore } from "@/stores/useAppStore";
import type { ToolTarget } from "@/types";

interface ProcessWarningBannerProps {
  tool: ToolTarget;
}

export function ProcessWarningBanner({ tool }: ProcessWarningBannerProps) {
  const processStatus = useAppStore((state) => state.processStatus);
  const [dismissed, setDismissed] = useState(false);
  const isActive = processStatus[tool];

  // Re-show banner if process becomes active again after dismissal
  useEffect(() => {
    if (isActive) {
      setDismissed(false);
    }
  }, [isActive]);

  if (!isActive || dismissed) return null;

  const toolLabel = tool === "code" ? "Claude Code" : "Claude Desktop";

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center gap-2 px-4 py-2 bg-amber-950/50 border-b border-amber-500/50 text-amber-400 text-sm shrink-0"
    >
      <span className="flex-1">
        {toolLabel} is running — changes will apply on next launch
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss warning"
        className="text-amber-400 hover:text-amber-200 transition-colors leading-none"
      >
        ×
      </button>
    </div>
  );
}
