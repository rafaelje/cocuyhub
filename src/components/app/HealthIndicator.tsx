import { useState, useEffect } from "react";
import { useConfigStore } from "@/stores/useConfigStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { getErrorMessage } from "@/lib/errors";
import type { CommandError } from "@/types";

interface ErrorDetailProps {
  error: CommandError;
  path: string | null;
  onClose: () => void;
}

function ErrorDetailPanel({ error, path, onClose }: ErrorDetailProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCopyPath = () => {
    if (path) {
      navigator.clipboard.writeText(path).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Config error details"
      className="absolute right-0 top-8 z-50 w-80 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-100">Config Error</h3>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-xs"
          aria-label="Close error details"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-zinc-300 mb-3">{getErrorMessage(error)}</p>

      {path && (
        <div className="mb-3">
          <p className="text-xs text-zinc-500 mb-1">File path:</p>
          <button
            onClick={handleCopyPath}
            className="w-full text-left font-mono text-xs bg-zinc-800 rounded px-2 py-1.5 text-zinc-300 hover:bg-zinc-700 transition-colors"
            title="Click to copy"
          >
            {copied ? "Copied!" : path}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="flex-1 text-xs rounded px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          onClick={onClose}
        >
          Open JSON Editor
        </button>
        <button
          className="flex-1 text-xs rounded px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          onClick={onClose}
        >
          Restore snapshot
        </button>
      </div>
    </div>
  );
}

export function HealthIndicator() {
  const [open, setOpen] = useState(false);
  const { codeError, desktopError } = useConfigStore();
  const { codePath, desktopPath } = useSettingsStore();

  const hasError = codeError !== null || desktopError !== null;
  const activeError = codeError ?? desktopError;
  const errorPath = codeError ? codePath : desktopPath;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-zinc-800 transition-colors"
        aria-label={hasError ? "Config error - click for details" : "All configs healthy"}
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            hasError ? "bg-red-500" : "bg-emerald-500"
          }`}
        />
        <span
          aria-live="polite"
          className={hasError ? "text-red-400" : "text-emerald-400"}
        >
          {hasError ? "Config error" : "Ready"}
        </span>
      </button>

      {open && hasError && activeError && (
        <ErrorDetailPanel
          error={activeError}
          path={errorPath}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
