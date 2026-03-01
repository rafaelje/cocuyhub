import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppStore } from "@/stores/useAppStore";
import { invokeCommand } from "@/lib/ipc";

export function UpdateReadyDialog() {
  const updateReady = useAppStore((state) => state.updateReady);
  const setUpdateReady = useAppStore((state) => state.setUpdateReady);
  const [isRestarting, setIsRestarting] = useState(false);

  const handleLater = () => {
    if (!isRestarting) setUpdateReady(false);
  };

  const handleRestartNow = async () => {
    setIsRestarting(true);
    try {
      await invokeCommand("restart_app");
      // App restarts — code below never runs on success
    } catch {
      // restart_app failed (unusual); reset so user can try again
      setIsRestarting(false);
      setUpdateReady(false);
    }
  };

  // Block backdrop/Escape while restarting
  const handleOpenChange = (open: boolean) => {
    if (!open && isRestarting) return;
    setUpdateReady(open);
  };

  return (
    <Dialog open={updateReady} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Update Ready</DialogTitle>
          <DialogDescription>
            Update ready to install. CocuyHub will restart to apply the
            update.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={handleLater}
            disabled={isRestarting}
            className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
          >
            Later
          </button>
          <button
            onClick={handleRestartNow}
            disabled={isRestarting}
            className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 text-white transition-colors rounded disabled:opacity-50"
          >
            {isRestarting ? "Restarting…" : "Restart Now"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
