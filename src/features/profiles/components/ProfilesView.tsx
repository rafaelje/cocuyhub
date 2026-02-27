import { useState, useEffect } from "react";
import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useProfileStore } from "@/stores/useProfileStore";
import type { Profile } from "@/types";
import { ProfileCreateForm } from "./ProfileCreateForm";
import { ProfileList } from "./ProfileList";

export function ProfilesView() {
  const [formOpen, setFormOpen] = useState(false);
  const profiles = useProfileStore((state) => state.profiles);

  useEffect(() => {
    useProfileStore.getState().fetchProfiles();
  }, []);

  const handleCreate = async (name: string, activeMcps: string[]): Promise<void> => {
    try {
      const newProfile = await invokeCommand<Profile>("profile_create", {
        name,
        activeMcps,
      });
      useProfileStore.getState().addProfile(newProfile);
      toast.success(`Profile ${name} created`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to create profile: ${msg}`, { duration: Infinity });
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-medium text-zinc-400">Profiles</h1>
        <button
          onClick={() => setFormOpen(true)}
          className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-600 rounded transition-colors"
        >
          Create Profile
        </button>
      </div>

      {profiles.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-8">
          No profiles yet. Create one to save your current MCP setup.
        </p>
      ) : (
        <ProfileList />
      )}

      <ProfileCreateForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
      />
    </div>
  );
}
