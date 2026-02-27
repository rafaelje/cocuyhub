import { useState } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/stores/useAppStore";
import { invokeCommand } from "@/lib/ipc";

export function UpdateNotificationBanner() {
  const updateVersion = useAppStore((state) => state.updateVersion);
  const downloadProgress = useAppStore((state) => state.downloadProgress);
  const updateReady = useAppStore((state) => state.updateReady);
  const setDownloadProgress = useAppStore((state) => state.setDownloadProgress);
  const setUpdateReady = useAppStore((state) => state.setUpdateReady);
  const [dismissed, setDismissed] = useState(false);

  if (!updateVersion || dismissed || updateReady) return null;

  const isDownloading = downloadProgress !== null;

  const startDownload = () => {
    setDownloadProgress(0);
    invokeCommand("download_and_install_update")
      .then(() => {
        setUpdateReady(true);
        setDownloadProgress(null);
      })
      .catch((err) => {
        const msg = (err as { message?: string })?.message ?? "Unknown error";
        setDownloadProgress(null);
        toast.error(`Failed to download update: ${msg}`, {
          duration: Infinity,
          action: { label: "Retry", onClick: startDownload },
        });
      });
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center gap-2 px-4 py-2 bg-blue-950/50 border-b border-blue-500/50 text-blue-300 text-sm shrink-0"
    >
      <span className="flex-1">
        {isDownloading
          ? `Downloading update… ${downloadProgress}%`
          : `Update available: v${updateVersion}`}
      </span>
      {!isDownloading && (
        <>
          <button
            onClick={startDownload}
            className="px-2 py-0.5 text-xs bg-blue-700 hover:bg-blue-600 text-blue-100 rounded transition-colors"
          >
            Install Now
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss update notification"
            className="text-blue-400 hover:text-blue-200 transition-colors leading-none"
          >
            Later
          </button>
        </>
      )}
    </div>
  );
}
