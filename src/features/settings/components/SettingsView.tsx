import { useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { invokeCommand } from "@/lib/ipc";
import type { AppSettings } from "@/types";

interface PathFieldProps {
  label: string;
  path: string | null;
  customPath: string;
  onCustomPathChange: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

function PathField({
  label,
  path,
  customPath,
  onCustomPathChange,
  onSave,
  isSaving,
}: PathFieldProps) {
  const isDetected = path !== null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-zinc-300">{label}</span>
        {isDetected && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">
            Verified
          </span>
        )}
        {!isDetected && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
            Not detected
          </span>
        )}
      </div>

      {isDetected ? (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <code className="text-xs text-zinc-400 font-mono bg-zinc-800 rounded px-2 py-1 flex-1 truncate">
            {path}
          </code>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
          <input
            type="text"
            value={customPath}
            onChange={(e) => onCustomPathChange(e.target.value)}
            placeholder="Enter path manually..."
            className="flex-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={onSave}
            disabled={isSaving || !customPath.trim()}
            className="text-xs px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-zinc-200 transition-colors"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

export function SettingsView() {
  const { codePath, desktopPath, isDetecting, detectPaths, setCodePath, setDesktopPath } =
    useSettingsStore();

  const [customCodePath, setCustomCodePath] = useState("");
  const [customDesktopPath, setCustomDesktopPath] = useState("");
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [isSavingDesktop, setIsSavingDesktop] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveCodePath = async () => {
    if (!customCodePath.trim()) return;
    setIsSavingCode(true);
    setSaveError(null);
    try {
      const newSettings: AppSettings = {
        codePath: customCodePath.trim(),
        desktopPath: desktopPath,
      };
      await invokeCommand("config_save_settings", { settings: newSettings });
      setCodePath(customCodePath.trim());
      setCustomCodePath("");
    } catch (err) {
      setSaveError("Failed to save code path");
      console.error(err);
    } finally {
      setIsSavingCode(false);
    }
  };

  const handleSaveDesktopPath = async () => {
    if (!customDesktopPath.trim()) return;
    setIsSavingDesktop(true);
    setSaveError(null);
    try {
      const newSettings: AppSettings = {
        codePath: codePath,
        desktopPath: customDesktopPath.trim(),
      };
      await invokeCommand("config_save_settings", { settings: newSettings });
      setDesktopPath(customDesktopPath.trim());
      setCustomDesktopPath("");
    } catch (err) {
      setSaveError("Failed to save desktop path");
      console.error(err);
    } finally {
      setIsSavingDesktop(false);
    }
  };

  const handleDetectPaths = async () => {
    setSaveError(null);
    await detectPaths();
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-base font-semibold text-zinc-100">Settings</h1>
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Claude Config Paths
          </h2>
          <button
            onClick={handleDetectPaths}
            disabled={isDetecting}
            className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-zinc-300 border border-zinc-700 transition-colors"
          >
            {isDetecting ? "Detecting..." : "Detect Paths"}
          </button>
        </div>

        {saveError && (
          <div className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded px-3 py-2">
            {saveError}
          </div>
        )}

        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <PathField
            label="Claude Code"
            path={codePath}
            customPath={customCodePath}
            onCustomPathChange={setCustomCodePath}
            onSave={handleSaveCodePath}
            isSaving={isSavingCode}
          />

          <PathField
            label="Claude Desktop"
            path={desktopPath}
            customPath={customDesktopPath}
            onCustomPathChange={setCustomDesktopPath}
            onSave={handleSaveDesktopPath}
            isSaving={isSavingDesktop}
          />
        </div>

        <p className="mt-3 text-xs text-zinc-600">
          Paths are detected automatically from standard locations. Use{" "}
          <span className="text-zinc-500">Detect Paths</span> to re-run detection.
        </p>
      </section>
    </div>
  );
}
