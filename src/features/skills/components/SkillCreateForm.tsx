import { useState } from "react";
import { toast } from "sonner";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { invokeCommand } from "@/lib/ipc";
import { useSkillStore } from "@/stores/useSkillStore";
import type { SkillLocation } from "@/types";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface SkillCreateFormProps {
  projectPaths: string[];
}

export function SkillCreateForm({ projectPaths }: SkillCreateFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<SkillLocation>("personal");
  const [projectPath, setProjectPath] = useState<string>(projectPaths[0] ?? "");
  const [submitting, setSubmitting] = useState(false);

  const nameValid = name.length > 0 && name.length <= 64 && SLUG_REGEX.test(name);
  const nameError =
    name.length > 0 && !nameValid
      ? "Must be lowercase alphanumeric with hyphens, 1-64 chars"
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid || submitting) return;

    setSubmitting(true);
    try {
      await invokeCommand("skill_create", {
        name,
        description,
        location,
        projectPath: location === "project" ? projectPath : null,
      });
      await useSkillStore.getState().reloadSkills();
      toast.success(`Skill ${name} created`, { duration: 3000 });
      setName("");
      setDescription("");
      setOpen(false);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to create skill: ${msg}`, { duration: Infinity });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Plus size={14} />
        <span>New Skill</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-3 flex flex-col gap-2">
          <div>
            <input
              className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 outline-none focus:border-zinc-500"
              placeholder="skill-name (lowercase, hyphens)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Skill name"
            />
            {nameError && (
              <p className="text-xs text-red-400 mt-0.5">{nameError}</p>
            )}
          </div>
          <textarea
            className="w-full px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-100 outline-none focus:border-zinc-500 resize-none"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            aria-label="Skill description"
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <input
                type="radio"
                name="skill-location"
                value="personal"
                checked={location === "personal"}
                onChange={() => setLocation("personal")}
                className="accent-emerald-500"
              />
              Personal
            </label>
            {projectPaths.map((pp) => (
              <label key={pp} className="flex items-center gap-1.5 text-xs text-zinc-400">
                <input
                  type="radio"
                  name="skill-location"
                  value="project"
                  checked={location === "project" && projectPath === pp}
                  onChange={() => { setLocation("project"); setProjectPath(pp); }}
                  className="accent-emerald-500"
                />
                Project: {pp.split("/").slice(-2).join("/")}
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={!nameValid || submitting}
            className="self-start px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors rounded"
          >
            {submitting ? "Creating…" : "Create Skill"}
          </button>
        </form>
      )}
    </div>
  );
}
