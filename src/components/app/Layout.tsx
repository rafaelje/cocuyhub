import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { UpdateNotificationBanner } from "./UpdateNotificationBanner";
import { UpdateReadyDialog } from "./UpdateReadyDialog";
import {
  useNavigationShortcuts,
  useSidebarToggle,
  useManualSnapshotShortcut,
} from "@/hooks/useKeyboardShortcuts";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { useAppStore } from "@/stores/useAppStore";
import { invokeCommand } from "@/lib/ipc";
import type { ToolTarget } from "@/types";

interface ProcessStatusChangedEvent {
  tool: ToolTarget;
  active: boolean;
}

interface ProgressPayload {
  percent: number;
}

export function Layout() {
  useNavigationShortcuts();
  useSidebarToggle();
  useManualSnapshotShortcut();

  const { loadSettings } = useSettingsStore();
  const { loadConfigs, setupFileWatcher } = useConfigStore();
  const { setProcessStatus, setUpdateVersion, setDownloadProgress } = useAppStore();

  useEffect(() => {
    let unlistenStatusChanged: (() => void) | undefined;
    let unlistenWatcher: (() => void) | undefined;
    let unlistenUpdateProgress: (() => void) | undefined;

    async function init() {
      // 1. Load settings (detects paths on first launch)
      await loadSettings();

      // 2. Load configs using detected paths
      await loadConfigs();

      // 3. Check active processes for both tools
      try {
        const [codeActive, desktopActive] = await Promise.allSettled([
          invokeCommand<boolean>("process_check_active", { tool: "code" }),
          invokeCommand<boolean>("process_check_active", { tool: "desktop" }),
        ]);

        if (codeActive.status === "fulfilled") {
          setProcessStatus("code", codeActive.value);
        }
        if (desktopActive.status === "fulfilled") {
          setProcessStatus("desktop", desktopActive.value);
        }
      } catch {
        // Non-fatal: process detection failure just means unknown status
      }

      // 4. Start background process polling
      try {
        await invokeCommand("process_start_polling");
      } catch {
        // Non-fatal
      }

      // 5. Listen for process status change events
      unlistenStatusChanged = await listen<ProcessStatusChangedEvent>(
        "process://status-changed",
        (event) => {
          const { tool, active } = event.payload;
          setProcessStatus(tool, active);
        }
      );

      // 6. Setup file watcher and listen for external changes
      unlistenWatcher = await setupFileWatcher();

      // 7. Fire-and-forget update check (fails silently — must not block init)
      invokeCommand<string | null>("check_for_update")
        .then((version) => { if (version) setUpdateVersion(version); })
        .catch(() => { /* silently ignore */ });

      // 8. Listen for update download progress events
      unlistenUpdateProgress = await listen<ProgressPayload>(
        "update://progress",
        (event) => {
          setDownloadProgress(event.payload.percent);
        }
      );
    }

    init();

    return () => {
      unlistenStatusChanged?.();
      unlistenWatcher?.();
      unlistenUpdateProgress?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-zinc-900 focus:text-zinc-50 focus:rounded"
      >
        Skip to content
      </a>

      <Header />
      <UpdateNotificationBanner />
      <UpdateReadyDialog />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main id="main-content" className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
