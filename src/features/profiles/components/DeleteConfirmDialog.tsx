import { useState } from "react";
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

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile | null;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  profile,
}: DeleteConfirmDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!profile) return;
    setIsDeleting(true);
    try {
      const wasActive =
        useProfileStore.getState().activeProfileId === profile.id;
      await invokeCommand("profile_delete", { id: profile.id });
      useProfileStore.getState().removeProfile(profile.id);
      if (wasActive) {
        useProfileStore.getState().setActiveProfileId(null);
      }
      toast.success(`Profile ${profile.name} deleted`);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to delete profile: ${msg}`, { duration: Infinity });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete profile?</DialogTitle>
          <DialogDescription>
            Delete profile {profile.name}? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white transition-colors rounded disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
