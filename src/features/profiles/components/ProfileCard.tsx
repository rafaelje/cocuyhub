import type { Profile } from "@/types";

interface ProfileCardProps {
  profile: Profile;
  isActive: boolean;
  onSwitch: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProfileCard({ profile, isActive, onSwitch, onEdit, onDelete }: ProfileCardProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-md bg-zinc-800/50 border border-zinc-700/50">
      <div className="flex items-center gap-2 min-w-0">
        {isActive && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded shrink-0">
            Active
          </span>
        )}
        <span className="text-sm text-zinc-200 truncate">{profile.name}</span>
        <span className="text-xs text-zinc-500 shrink-0">
          {profile.activeMcps.length} MCPs
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!isActive && (
          <button
            onClick={onSwitch}
            className="px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
          >
            Switch
          </button>
        )}
        <button
          onClick={onEdit}
          className="px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
