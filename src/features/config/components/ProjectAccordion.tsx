import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { ClaudeConfig, ProjectConfig } from "@/types";
import { ProjectMcpList } from "./ProjectMcpList";

interface ProjectAccordionProps {
  projectPath: string;
  projectConfig: ProjectConfig | null | undefined;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: () => void;
  onDeleteProject: (path: string) => void;
  desktopConfig: ClaudeConfig | null;
}

export function ProjectAccordion({
  projectPath,
  projectConfig,
  isExpanded,
  isActive,
  onToggle,
  onDeleteProject,
  desktopConfig,
}: ProjectAccordionProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const basename = projectPath.split("/").pop() ?? projectPath;
  const mcpCount =
    Object.keys(projectConfig?.mcpServers ?? {}).length +
    Object.keys(projectConfig?.disabledMcps ?? {}).length;

  const handleConfirmDelete = () => {
    setDeleteDialogOpen(false);
    onDeleteProject(projectPath);
  };

  return (
    <div className={`border-b border-zinc-800 ${isActive ? "border-l-2 border-l-amber-500" : "border-l-2 border-l-transparent"}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-2 hover:bg-zinc-800 transition-colors ${isActive ? "bg-amber-950/20" : ""}`}>
        <button
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 text-left"
          aria-expanded={isExpanded}
          aria-label={`Toggle project ${basename}`}
        >
          <span className="text-zinc-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
          <span
            className={`text-sm font-medium truncate ${isActive ? "text-amber-300" : "text-zinc-200"}`}
            title={projectPath}
          >
            {basename}
          </span>
          <span className="shrink-0 text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
            {mcpCount > 0 ? `${mcpCount} MCP` : "Empty"}
          </span>
        </button>
        {isActive && (
          <span className="shrink-0 text-xs text-amber-500 bg-amber-950/50 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
            📋 paste target
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDeleteDialogOpen(true);
          }}
          aria-label={`Delete project ${basename}`}
          className="p-1 text-zinc-600 hover:text-red-400 transition-colors rounded shrink-0"
        >
          🗑
        </button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-zinc-800/50">
          <ProjectMcpList
            config={projectConfig}
            projectPath={projectPath}
            desktopConfig={desktopConfig}
          />
        </div>
      )}

      {/* Delete project confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Project?</DialogTitle>
            <DialogDescription>
              Remove <strong>{basename}</strong> and all its MCP configuration from Claude Code?
              This cannot be undone (but a snapshot will be created first).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500">
                Cancel
              </button>
            </DialogClose>
            <button
              onClick={handleConfirmDelete}
              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white transition-colors rounded"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
