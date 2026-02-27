import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { useAppStore } from "@/stores/useAppStore";
import type { ClaudeConfig, ProjectConfig } from "@/types";
import { ProjectAccordion } from "./ProjectAccordion";

const STORAGE_KEY = "config:expanded-projects";

interface ProjectsSectionProps {
  projects: Record<string, ProjectConfig> | undefined;
  desktopConfig: ClaudeConfig | null;
}

export function ProjectsSection({ projects, desktopConfig }: ProjectsSectionProps) {
  const setActiveProjectPath = useAppStore((s) => s.setActiveProjectPath);
  const activeProjectPath = useAppStore((s) => s.activeProjectPath);

  const sortedPaths = Object.keys(projects ?? {}).sort((a, b) => a.localeCompare(b));

  const initExpandedPaths = useCallback((): Set<string> => {
    try {
      const storedRaw = localStorage.getItem(STORAGE_KEY);
      const stored: string[] = storedRaw ? JSON.parse(storedRaw) : [];
      const filtered = stored.filter((p) => sortedPaths.includes(p));
      if (filtered.length > 0) return new Set(filtered);
    } catch {
      // ignore parse errors
    }
    return sortedPaths.length > 0 ? new Set([sortedPaths[0]]) : new Set();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedPaths.join(",")]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(initExpandedPaths);

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...expandedPaths]));
  }, [expandedPaths]);

  // Re-initialize when sortedPaths changes (e.g., project deleted)
  useEffect(() => {
    setExpandedPaths((prev) => {
      const filtered = new Set([...prev].filter((p) => sortedPaths.includes(p)));
      if (filtered.size === 0 && sortedPaths.length > 0) {
        return new Set([sortedPaths[0]]);
      }
      return filtered;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedPaths.join(",")]);

  if (sortedPaths.length === 0) return null;

  const handleToggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
        if (path === activeProjectPath) {
          setActiveProjectPath(null);
        }
      } else {
        next.clear();
        next.add(path);
        setActiveProjectPath(path);
      }
      return next;
    });
  };

  const handleDeleteProject = async (path: string) => {
    try {
      await invokeCommand("project_delete", { projectPath: path });
      await useConfigStore.getState().reloadConfig("code");
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      if (path === activeProjectPath) {
        setActiveProjectPath(null);
      }
      toast.success(`Project removed`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to delete project: ${msg}`, { duration: Infinity });
    }
  };

  const handleExpandAll = () => {
    setExpandedPaths(new Set(sortedPaths));
    setActiveProjectPath(sortedPaths[sortedPaths.length - 1] ?? null);
  };

  const handleCollapseAll = () => {
    setExpandedPaths(new Set());
    setActiveProjectPath(null);
  };

  return (
    <div className="flex flex-col">
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800 bg-zinc-950">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">
          Projects
        </span>
        <button
          onClick={handleExpandAll}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-500"
        >
          Expand All
        </button>
        <button
          onClick={handleCollapseAll}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-500"
        >
          Collapse All
        </button>
      </div>

      {/* Project accordions */}
      {sortedPaths.map((path) => (
        <ProjectAccordion
          key={path}
          projectPath={path}
          projectConfig={projects?.[path]}
          isExpanded={expandedPaths.has(path)}
          isActive={activeProjectPath === path}
          onToggle={() => handleToggle(path)}
          onDeleteProject={handleDeleteProject}
          desktopConfig={desktopConfig}
        />
      ))}
    </div>
  );
}
