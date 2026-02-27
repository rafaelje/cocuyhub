import { useState } from "react";
import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { useProfileStore } from "@/stores/useProfileStore";
import type { Profile } from "@/types";
import { DiffPreviewDialog } from "./DiffPreviewDialog";
import { ProfileCreateForm } from "./ProfileCreateForm";

export function MixedDiffBanner() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [createFormOpen, setCreateFormOpen] = useState(false);

  const activeProfileId = useProfileStore((state) => state.activeProfileId);
  const profiles = useProfileStore((state) => state.profiles);
  const codeConfig = useConfigStore((state) => state.codeConfig);

  const handleCreate = async (name: string): Promise<void> => {
    try {
      const newProfile = await invokeCommand<Profile>("profile_create", { name });
      useProfileStore.getState().addProfile(newProfile);
      toast.success(`Profile ${name} created`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to create profile: ${msg}`, { duration: Infinity });
    }
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

  if (!activeProfile) return null;

  const enabledInCode = Object.entries(codeConfig?.mcpServers ?? {})
    .filter(([, cfg]) => !cfg.disabled)
    .map(([name]) => name);

  const profileSet = new Set(Object.keys(activeProfile.mcpServers.code));
  const added = enabledInCode.filter((m) => !profileSet.has(m));
  const missing = Object.keys(activeProfile.mcpServers.code).filter(
    (m) => !enabledInCode.includes(m)
  );

  if (added.length === 0 && missing.length === 0) return null;

  return (
    <div aria-live="polite" className="border-b border-zinc-800 px-3 py-2 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-amber-400 font-medium">Mixed state</span>
        <button
          onClick={() => setIsCollapsed((v) => !v)}
          aria-expanded={!isCollapsed}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {isCollapsed ? "▸" : "▾"}
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex flex-col gap-1">
          {added.length > 0 && (
            <p className="text-amber-400 truncate">
              + active vs {activeProfile.name}: {added.join(", ")}
            </p>
          )}
          {missing.length > 0 && (
            <p className="text-red-400 truncate">
              - missing vs {activeProfile.name}: {missing.join(", ")}
            </p>
          )}
          <div className="flex gap-2 mt-1.5">
            <button
              onClick={() => setResetDialogOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 underline transition-colors"
            >
              Reset to {activeProfile.name}
            </button>
            <button
              onClick={() => setCreateFormOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 underline transition-colors"
            >
              Save as new profile...
            </button>
          </div>
        </div>
      )}

      <DiffPreviewDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        profile={activeProfile}
      />
      <ProfileCreateForm
        open={createFormOpen}
        onOpenChange={setCreateFormOpen}
        onSubmit={handleCreate}
      />
    </div>
  );
}
