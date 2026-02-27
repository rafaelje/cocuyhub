import { useEffect, useState, useMemo } from "react";
import { useSkillStore } from "@/stores/useSkillStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { SkillCreateForm } from "./SkillCreateForm";
import { SkillList } from "./SkillList";

export function SkillsView() {
  const { skills, isLoading, error, loadSkills } = useSkillStore();
  const codeConfig = useConfigStore((s) => s.codeConfig);

  const projectPaths = useMemo(
    () => Object.keys(codeConfig?.projects ?? {}),
    [codeConfig?.projects]
  );

  useEffect(() => {
    loadSkills(projectPaths);
  }, [loadSkills, projectPaths]);

  // Section collapsed state
  const [personalExpanded, setPersonalExpanded] = useState(false);
  const [projectExpanded, setProjectExpanded] = useState<Record<string, boolean>>({});

  const personalCount = skills.filter((s) => s.location === "personal").length;

  const toggleProject = (pp: string) => {
    setProjectExpanded((prev) => ({ ...prev, [pp]: !(prev[pp] ?? true) }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SkillCreateForm projectPaths={projectPaths} />

      <div className="flex-1 overflow-y-auto">
        {/* Personal section */}
        <div className="shrink-0 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
          <button
            onClick={() => setPersonalExpanded((prev) => !prev)}
            className="flex items-center gap-2 w-full text-left"
            aria-expanded={personalExpanded}
            aria-label="Toggle Personal section"
          >
            <span className="text-zinc-400 text-xs">{personalExpanded ? "▼" : "▶"}</span>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">
              Personal
            </span>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {personalCount > 0 ? `${personalCount} Skill${personalCount !== 1 ? "s" : ""}` : "Empty"}
            </span>
          </button>
        </div>
        {personalExpanded && (
          <SkillList
            skills={skills}
            location="personal"
            isLoading={isLoading}
            error={error}
          />
        )}

        {/* Project sections */}
        {projectPaths.map((pp) => {
          const projectCount = skills.filter(
            (s) => s.location === "project" && s.projectPath === pp
          ).length;
          const expanded = projectExpanded[pp] ?? false;

          return (
            <div key={pp}>
              <div className="shrink-0 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
                <button
                  onClick={() => toggleProject(pp)}
                  className="flex items-center gap-2 w-full text-left"
                  aria-expanded={expanded}
                  aria-label={`Toggle Project ${pp} section`}
                >
                  <span className="text-zinc-400 text-xs">{expanded ? "▼" : "▶"}</span>
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1 truncate">
                    Project: {pp}
                  </span>
                  <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                    {projectCount > 0 ? `${projectCount} Skill${projectCount !== 1 ? "s" : ""}` : "Empty"}
                  </span>
                </button>
              </div>
              {expanded && (
                <SkillList
                  skills={skills}
                  location="project"
                  projectPath={pp}
                  isLoading={isLoading}
                  error={error}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
