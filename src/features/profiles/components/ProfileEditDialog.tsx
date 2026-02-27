import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useProfileStore } from "@/stores/useProfileStore";
import type { Profile } from "@/types";

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
}

export function ProfileEditDialog({
  open,
  onOpenChange,
  profile,
}: ProfileEditDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState("");

  const profiles = useProfileStore((state) => state.profiles);

  // Initialize from profile on open; reset on close
  useEffect(() => {
    if (open && profile) {
      setName(profile.name);
      setNameError("");
    }
    if (!open) {
      setName("");
      setNameError("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.id]);

  // Uniqueness validation — exclude self
  useEffect(() => {
    if (
      name.trim() &&
      profiles.some((p) => p.id !== profile?.id && p.name === name.trim())
    ) {
      setNameError("Profile name already exists");
    } else {
      setNameError("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, profiles, profile?.id]);

  const handleSave = async () => {
    if (!profile) return;
    setIsSubmitting(true);
    try {
      const updated = await invokeCommand<Profile>("profile_update", {
        id: profile.id,
        name: name.trim(),
      });
      useProfileStore.getState().updateProfile(updated);
      toast.success(`Profile ${updated.name} updated`);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to update profile: ${msg}`, { duration: Infinity });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSave = name.trim().length > 0 && !nameError && !isSubmitting;

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update profile name.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="edit-profile-name" className="text-xs text-zinc-400">
              Name <span className="text-zinc-600">(required)</span>
            </label>
            <div className="relative">
              <input
                id="edit-profile-name"
                type="text"
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value.slice(0, 32))}
                placeholder='e.g. "Work", "Research", "Debug"'
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              {name.length >= 20 && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                  {name.length}/32
                </span>
              )}
            </div>
            {nameError && (
              <p className="text-xs text-red-400">{nameError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white transition-colors rounded disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
