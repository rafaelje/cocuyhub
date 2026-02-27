import { useState } from "react";
import { useProfileStore } from "@/stores/useProfileStore";
import type { Profile } from "@/types";
import { ProfileCard } from "./ProfileCard";
import { DiffPreviewDialog } from "./DiffPreviewDialog";
import { ProfileEditDialog } from "./ProfileEditDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

export function ProfileList() {
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<Profile | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const profiles = useProfileStore((state) => state.profiles);
  const activeProfileId = useProfileStore((state) => state.activeProfileId);

  function handleSwitch(profile: Profile) {
    setPendingProfile(profile);
    setDialogOpen(true);
  }

  function handleEdit(profile: Profile) {
    setEditingProfile(profile);
    setEditDialogOpen(true);
  }

  function handleDelete(profile: Profile) {
    setDeletingProfile(profile);
    setDeleteDialogOpen(true);
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            isActive={profile.id === activeProfileId}
            onSwitch={() => handleSwitch(profile)}
            onEdit={() => handleEdit(profile)}
            onDelete={() => handleDelete(profile)}
          />
        ))}
      </div>

      <DiffPreviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profile={pendingProfile}
      />

      <ProfileEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        profile={editingProfile}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        profile={deletingProfile}
      />
    </>
  );
}
