import { forwardRef, useImperativeHandle, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfigStore } from "@/stores/useConfigStore";
import { useProfileStore } from "@/stores/useProfileStore";
import type { Profile } from "@/types";
import { DiffPreviewDialog } from "./DiffPreviewDialog";

export interface ProfileSwitcherHandle {
  open: () => void;
}

export const ProfileSwitcher = forwardRef<ProfileSwitcherHandle>(
  (_, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const profiles = useProfileStore((state) => state.profiles);
    const activeProfileId = useProfileStore((state) => state.activeProfileId);
    const computeMixedState = useProfileStore((state) => state.computeMixedState);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _codeConfig = useConfigStore((state) => state.codeConfig);
    const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
    const isMixed = !!activeProfile && computeMixedState("code");

    useImperativeHandle(ref, () => ({
      open: () => setIsOpen(true),
    }));

    function handleProfileClick(profile: Profile) {
      if (profile.id === activeProfileId) return;
      setIsOpen(false);
      setPendingProfile(profile);
      setDialogOpen(true);
    }

    return (
      <>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              aria-haspopup="listbox"
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 transition-colors select-none"
            >
              {activeProfile ? (
                <>
                  {isMixed ? (
                    <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.5 rounded shrink-0">
                      Mixed
                    </span>
                  ) : (
                    <span
                      className="size-1.5 rounded-full bg-emerald-500 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span>{activeProfile.name}</span>
                </>
              ) : (
                <span className="text-zinc-500">No Profile</span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {profiles.length === 0 ? (
              <DropdownMenuItem disabled role="option">
                No profiles yet.
              </DropdownMenuItem>
            ) : (
              profiles.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  role="option"
                  onClick={() => handleProfileClick(p)}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {p.id === activeProfileId ? (
                      <span
                        className="size-1.5 rounded-full bg-emerald-500 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="size-1.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {p.activeMcps.length} MCPs
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DiffPreviewDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          profile={pendingProfile}
        />
      </>
    );
  }
);
ProfileSwitcher.displayName = "ProfileSwitcher";
