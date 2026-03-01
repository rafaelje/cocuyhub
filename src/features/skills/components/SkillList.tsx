import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useSkillStore } from "@/stores/useSkillStore";
import type { SkillInfo, SkillLocation, SkillTreeNode } from "@/types";
import { SkillRow, type CopyDestination } from "./SkillRow";
import { InlineSkillTree } from "./SkillWorkspaceTree";

interface SkillListProps {
  skills: SkillInfo[];
  location: SkillLocation;
  projectPath?: string;
  isLoading: boolean;
  error: string | null;
  selectedSkillKey?: string | null;
  onSelectSkill?: (skill: SkillInfo) => void;
  onToggleActive?: (skill: SkillInfo, active: boolean) => Promise<void>;
  onExport?: (skill: SkillInfo) => void;
  onCopyTo?: (skill: SkillInfo, destLocation: SkillLocation, destProjectPath: string | null) => void;
  availableDestinations?: CopyDestination[];
  // Inline tree props
  expandedSkillKey: string | null;
  skillTree: SkillTreeNode | null;
  isTreeLoading: boolean;
  treeError: string | null;
  selectedFilePath: string | null;
  onToggleExpand: (skill: SkillInfo) => void;
  onSelectFile: (relPath: string) => void;
}

export function SkillList({
  skills, location, projectPath, isLoading, error, selectedSkillKey,
  onSelectSkill, onToggleActive, onExport, onCopyTo, availableDestinations,
  expandedSkillKey, skillTree, isTreeLoading, treeError, selectedFilePath,
  onToggleExpand, onSelectFile,
}: SkillListProps) {
  const filtered = skills
    .filter((s) => {
      if (s.location !== location) return false;
      if (location === "project" && s.projectPath !== projectPath) return false;
      return true;
    })
    .sort((a, b) => a.slug.localeCompare(b.slug, undefined, { sensitivity: "base" }));

  const handleDelete = async (slug: string) => {
    try {
      await invokeCommand("skill_delete", { slug, location, projectPath });
      await useSkillStore.getState().reloadSkills();
      toast.success(`Skill ${slug} removed`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to delete skill: ${msg}`, { duration: Infinity });
    }
  };

  const handleRename = async (oldSlug: string, newSlug: string) => {
    try {
      await invokeCommand("skill_rename", { oldSlug, newSlug, location, projectPath });
      await useSkillStore.getState().reloadSkills();
      toast.success(`Skill ${oldSlug} renamed to ${newSlug}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to rename skill: ${msg}`, { duration: Infinity });
      throw err;
    }
  };

  const handleToggleFrontmatter = async (slug: string, key: string, value: string) => {
    try {
      await invokeCommand("skill_update_frontmatter", {
        slug, key, value: value || null, location, projectPath,
      });
      await useSkillStore.getState().reloadSkills();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to update skill: ${msg}`, { duration: Infinity });
      throw err;
    }
  };

  const handleDescriptionChange = async (slug: string, description: string) => {
    try {
      await invokeCommand("skill_update_frontmatter", {
        slug, key: "description", value: description || null, location, projectPath,
      });
      await useSkillStore.getState().reloadSkills();
      toast.success(`Description updated for ${slug}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to update description: ${msg}`, { duration: Infinity });
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-6 bg-zinc-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center">
        <p className="text-sm text-red-400 text-center py-8">{error}</p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center">
        <p className="text-sm text-zinc-500 text-center py-8">
          No skills found. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div role="tree">
      {filtered.map((skill) => {
        const key = `${skill.location}:${skill.projectPath ?? ""}:${skill.slug}`;
        const isExpanded = expandedSkillKey === key;
        return (
          <div key={key}>
            <SkillRow
              skill={skill}
              isExpanded={isExpanded}
              onDelete={handleDelete}
              onRename={handleRename}
              onToggleFrontmatter={handleToggleFrontmatter}
              onDescriptionChange={handleDescriptionChange}
              existingNames={filtered.map((s) => s.slug)}
              isSelected={selectedSkillKey === key}
              onSelect={onSelectSkill}
              onToggleActive={onToggleActive}
              onExport={onExport}
              onCopyTo={onCopyTo}
              availableDestinations={availableDestinations?.filter(
                (d) => !(d.location === skill.location && d.projectPath === skill.projectPath)
              )}
              onToggleExpand={() => onToggleExpand(skill)}
            />
            {isExpanded && (
              <div className="bg-zinc-900/50">
                {isTreeLoading ? (
                  <div className="px-6 py-2">
                    <div className="h-4 bg-zinc-800 rounded animate-pulse w-32" />
                  </div>
                ) : treeError ? (
                  <div className="px-6 py-2">
                    <p className="text-xs text-red-400">{treeError}</p>
                  </div>
                ) : skillTree ? (
                  <InlineSkillTree
                    tree={skillTree}
                    skill={skill}
                    selectedFilePath={selectedFilePath}
                    onSelectFile={onSelectFile}
                  />
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
