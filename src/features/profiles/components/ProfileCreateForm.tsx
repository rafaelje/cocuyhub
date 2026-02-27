import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfigStore } from "@/stores/useConfigStore";
import { useProfileStore } from "@/stores/useProfileStore";

interface ProfileCreateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, activeMcps: string[]) => Promise<void>;
}

export function ProfileCreateForm({
  open,
  onOpenChange,
  onSubmit,
}: ProfileCreateFormProps) {
  const [name, setName] = useState("");
  const [selectedMcps, setSelectedMcps] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState("");

  const codeConfig = useConfigStore((state) => state.codeConfig);
  const profiles = useProfileStore((state) => state.profiles);

  const allMcpNames = Object.keys(codeConfig?.mcpServers ?? {});

  // Initialize selectedMcps from currently enabled MCPs on open; reset on close
  useEffect(() => {
    if (open && codeConfig) {
      const enabledMcps = Object.entries(codeConfig.mcpServers)
        .filter(([, cfg]) => cfg.disabled !== true)
        .map(([n]) => n);
      setSelectedMcps(new Set(enabledMcps));
    }
    if (!open) {
      setName("");
      setSelectedMcps(new Set());
      setNameError("");
    }
  }, [open]);

  // Duplicate name validation
  useEffect(() => {
    if (name.trim() && profiles.some((p) => p.name === name.trim())) {
      setNameError("Profile name already exists");
    } else {
      setNameError("");
    }
  }, [name, profiles]);

  const toggleMcp = (mcpName: string) => {
    setSelectedMcps((prev) => {
      const next = new Set(prev);
      if (next.has(mcpName)) next.delete(mcpName);
      else next.add(mcpName);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(name.trim(), [...selectedMcps]);
    } finally {
      setIsSubmitting(false);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    if (!isSubmitting) onOpenChange(false);
  };

  const canSave = name.trim().length > 0 && !nameError && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Create Profile</DialogTitle>
          <DialogDescription>
            Save your current MCP selection as a named profile.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="profile-name" className="text-xs text-zinc-400">
              Name <span className="text-zinc-600">(required)</span>
            </label>
            <div className="relative">
              <input
                id="profile-name"
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

          {allMcpNames.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-zinc-400">Active MCPs</span>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {allMcpNames.map((mcpName) => (
                  <label
                    key={mcpName}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-800/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMcps.has(mcpName)}
                      onChange={() => toggleMcp(mcpName)}
                      className="accent-emerald-500"
                    />
                    <span className="text-sm text-zinc-200 truncate">{mcpName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={handleCancel}
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
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
