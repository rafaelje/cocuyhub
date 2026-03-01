import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { invokeCommand } from "@/lib/ipc";
import { useSkillStore } from "@/stores/useSkillStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { SkillLocation } from "@/types";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface SkillCreateFormProps {
  projectPaths: string[];
  hasDesktopSkills: boolean;
}

export function SkillCreateForm({ projectPaths, hasDesktopSkills }: SkillCreateFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [location, setLocation] = useState<SkillLocation>("personal");
  const [projectPath, setProjectPath] = useState<string>(projectPaths[0] ?? "");
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const nameValid = name.length > 0 && name.length <= 64 && SLUG_REGEX.test(name);
  const nameError =
    name.length > 0 && !nameValid
      ? "Must be lowercase alphanumeric with hyphens, 1-64 chars"
      : null;

  useEffect(() => {
    if (open) setTimeout(() => nameRef.current?.focus(), 50);
  }, [open]);

  const handleOpen = () => {
    setName("");
    setDescription("");
    setInstructions("");
    setLocation("personal");
    setProjectPath(projectPaths[0] ?? "");
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!nameValid || submitting) return;
    setSubmitting(true);
    try {
      await invokeCommand("skill_create", {
        name,
        description,
        location,
        projectPath: location === "project" ? projectPath : null,
        instructions: instructions.trim() || null,
      });
      await useSkillStore.getState().reloadSkills();
      toast.success(`Skill "${name}" created`, { duration: 3000 });
      setOpen(false);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to create skill: ${msg}`, { duration: Infinity });
    } finally {
      setSubmitting(false);
    }
  };

  // Encode location + projectPath into a single select value
  const locationValue =
    location === "personal"
      ? "personal:"
      : location === "desktop_skills"
        ? "desktop_skills:"
        : `project:${projectPath}`;

  const handleLocationChange = (val: string) => {
    const [loc, ...rest] = val.split(":");
    const pp = rest.join(":");
    if (loc === "personal") {
      setLocation("personal");
    } else if (loc === "desktop_skills") {
      setLocation("desktop_skills");
    } else {
      setLocation("project");
      setProjectPath(pp);
    }
  };

  const hasMultipleLocations = projectPaths.length > 0 || hasDesktopSkills;

  return (
    <div className="border-b border-zinc-800 shrink-0">
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
      >
        <Plus size={14} />
        <span>New Skill</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Write skill instructions</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Skill name */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Skill name
              </label>
              <input
                ref={nameRef}
                className="w-full px-3 py-2 text-sm font-mono bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 outline-none focus:border-zinc-500 placeholder-zinc-600"
                placeholder="weekly-status-report"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Skill name"
              />
              {nameError && (
                <p className="text-xs text-red-400 mt-1">{nameError}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Description
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 outline-none focus:border-zinc-500 placeholder-zinc-600 resize-none"
                placeholder="Generate weekly status reports from recent work. Use when asked for updates or progress summaries."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                aria-label="Skill description"
              />
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Instructions
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 outline-none focus:border-zinc-500 placeholder-zinc-600 resize-none"
                placeholder="Summarize my recent work in three sections: wins, blockers, and next steps. Keep the tone professional but not stiff..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={5}
                aria-label="Skill instructions"
              />
            </div>

            {/* Location selector */}
            {hasMultipleLocations && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Location
                </label>
                <select
                  value={locationValue}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-300 outline-none focus:border-zinc-500"
                  aria-label="Skill location"
                >
                  <option value="personal:">Claude Code Skills</option>
                  {hasDesktopSkills && (
                    <option value="desktop_skills:">Claude Desktop Skills</option>
                  )}
                  {projectPaths.map((pp) => (
                    <option key={pp} value={`project:${pp}`}>
                      Project: {pp.split("/").slice(-2).join("/")}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!nameValid || submitting}
              className="px-4 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-100 transition-colors rounded-md"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
