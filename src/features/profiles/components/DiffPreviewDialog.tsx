import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { useProfileStore } from "@/stores/useProfileStore";
import type { Profile } from "@/types";

interface DiffPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
}

export function DiffPreviewDialog({
  open,
  onOpenChange,
  profile,
}: DiffPreviewDialogProps) {
  const [isApplying, setIsApplying] = useState(false);
  const codeConfig = useConfigStore((state) => state.codeConfig);
  const desktopConfig = useConfigStore((state) => state.desktopConfig);

  if (!profile) return null;

  // Compute which MCPs are currently enabled across both configs
  const enabledMcps = new Set<string>([
    ...Object.entries(codeConfig?.mcpServers ?? {})
      .filter(([, s]) => !s.disabled)
      .map(([n]) => n),
    ...Object.entries(desktopConfig?.mcpServers ?? {})
      .filter(([, s]) => !s.disabled)
      .map(([n]) => n),
  ]);

  const profileMcps = new Set(profile.activeMcps);

  const activating = [...profileMcps].filter((m) => !enabledMcps.has(m));
  const deactivating = [...enabledMcps].filter((m) => !profileMcps.has(m));
  const noChanges = activating.length === 0 && deactivating.length === 0;

  async function handleApply() {
    setIsApplying(true);
    try {
      await invokeCommand("profile_apply", { profileId: profile!.id });
      useProfileStore.getState().setActiveProfileId(profile!.id);
      await useConfigStore.getState().reloadConfig("code");
      await useConfigStore.getState().reloadConfig("desktop");
      toast.success(`Switched to ${profile!.name}`, { duration: 3000 });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to apply profile: ${msg}`, { duration: Infinity });
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to {profile.name}?</DialogTitle>
          <DialogDescription>
            A snapshot will be created automatically
          </DialogDescription>
        </DialogHeader>

        {noChanges ? (
          <p className="text-sm text-zinc-400">
            No changes — current state already matches this profile
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {activating.length > 0 && (
              <div>
                <p className="text-xs font-medium text-emerald-400 mb-1">
                  Activating
                </p>
                <ul className="flex flex-col gap-0.5">
                  {activating.map((mcp) => (
                    <li key={mcp} className="text-xs text-emerald-300">
                      ✓ {mcp}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {deactivating.length > 0 && (
              <div>
                <p className="text-xs font-medium text-red-400 mb-1">
                  Deactivating
                </p>
                <ul className="flex flex-col gap-0.5">
                  {deactivating.map((mcp) => (
                    <li key={mcp} className="text-xs text-red-300">
                      ✕ {mcp}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-2">
          {noChanges ? (
            <button
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={() => onOpenChange(false)}
                className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying}
                className="px-3 py-1.5 text-sm text-zinc-100 bg-emerald-600 hover:bg-emerald-500 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApplying ? "Applying..." : "Apply Profile"}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
