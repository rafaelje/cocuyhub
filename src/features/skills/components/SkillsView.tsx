import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { invokeCommand } from "@/lib/ipc";
import { useSkillStore } from "@/stores/useSkillStore";
import { useConfigStore } from "@/stores/useConfigStore";
import { SkillCreateForm } from "./SkillCreateForm";
import { SkillList } from "./SkillList";
import { SkillFileEditor } from "./SkillFileEditor";
import { Search, RefreshCw } from "lucide-react";
import { SkillSearchDialog } from "./SearchResults";
import type { SkillInfo, SkillLocation } from "@/types";
import { buildDestinations, encodeDestination, decodeDestination } from "./destinations";
import type { CopyDestination } from "./destinations";

// ── Export/Import dialog state ──
interface ExportDialogState { open: boolean; skill: SkillInfo | null; destPath: string }
interface ImportDialogState {
  open: boolean;
  zipPath: string;
  location: string;
  projectPath: string | null;
  conflictSlug: string | null;
  conflictAction: "replace" | "rename" | null;
  renameSlug: string;
}

export function SkillsView() {
  const {
    skills, isLoading, error, loadSkills, selectedSkill, selectSkill,
    skillTree, isTreeLoading, treeError, loadSkillTree,
    selectedFilePath, openFile,
  } = useSkillStore();
  const codeConfig = useConfigStore((s) => s.codeConfig);

  const projectPaths = useMemo(
    () => Object.keys(codeConfig?.projects ?? {}),
    [codeConfig?.projects]
  );

  useEffect(() => { loadSkills(projectPaths); }, [loadSkills, projectPaths]);

  // ── Expanded skill (only one at a time) ──
  const [expandedSkillKey, setExpandedSkillKey] = useState<string | null>(null);

  const skillKey = (s: SkillInfo) =>
    `${s.location}:${s.projectPath ?? ""}:${s.slug}`;

  const handleToggleExpand = (skill: SkillInfo) => {
    const key = skillKey(skill);
    if (expandedSkillKey === key) {
      // Collapse
      setExpandedSkillKey(null);
    } else {
      // Expand new skill
      setExpandedSkillKey(key);
      selectSkill(skill);
      loadSkillTree(skill.slug, skill.location, skill.projectPath);
    }
  };

  const handleSelectSkill = (skill: SkillInfo) => {
    selectSkill(skill);
  };

  const handleSelectFile = (relPath: string) => {
    if (!selectedSkill) return;
    openFile(selectedSkill.slug, selectedSkill.location, selectedSkill.projectPath, relPath);
  };

  const selectedKey = selectedSkill ? skillKey(selectedSkill) : null;

  const [personalExpanded, setPersonalExpanded] = useState(true);
  const [desktopSkillsExpanded, setDesktopSkillsExpanded] = useState(true);
  const [desktopExamplesExpanded, setDesktopExamplesExpanded] = useState(false);
  const [projectsGroupExpanded, setProjectsGroupExpanded] = useState(true);
  const [projectExpanded, setProjectExpanded] = useState<Record<string, boolean>>({});
  const personalCount = skills.filter((s) => s.location === "personal").length;
  const desktopSkillsCount = skills.filter((s) => s.location === "desktop_skills").length;
  const desktopExamplesCount = skills.filter((s) => s.location === "desktop_examples").length;
  const totalProjectCount = skills.filter((s) => s.location === "project").length;
  const toggleProject = (pp: string) =>
    setProjectExpanded((prev) => ({ ...prev, [pp]: !(prev[pp] ?? true) }));

  // ── Search dialog ──
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSearchNavigate = useCallback(
    (skill: SkillInfo) => {
      selectSkill(skill);
      const key = `${skill.location}:${skill.projectPath ?? ""}:${skill.slug}`;
      setExpandedSkillKey(key);
      loadSkillTree(skill.slug, skill.location, skill.projectPath);
      // Expand the section that contains this skill
      if (skill.location === "personal") setPersonalExpanded(true);
      else if (skill.location === "desktop_skills") setDesktopSkillsExpanded(true);
      else if (skill.location === "desktop_examples") setDesktopExamplesExpanded(true);
      else if (skill.location === "project") {
        setProjectsGroupExpanded(true);
        if (skill.projectPath) setProjectExpanded((prev) => ({ ...prev, [skill.projectPath!]: true }));
      }
    },
    [selectSkill, loadSkillTree],
  );

  // Cmd+K / Ctrl+K → open search dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Activation toggle ──
  const handleToggleActive = async (skill: SkillInfo, active: boolean) => {
    try {
      await invokeCommand("skill_update_frontmatter", {
        slug: skill.slug,
        key: "disabled",
        value: active ? null : "true",
        location: skill.location,
        projectPath: skill.projectPath,
      });
      await useSkillStore.getState().reloadSkills();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Toggle failed";
      toast.error(msg, { duration: Infinity });
    }
  };

  // ── Copy between locations ──
  const availableDestinations = useMemo<CopyDestination[]>(
    () => buildDestinations(skills, projectPaths),
    [skills, projectPaths],
  );

  const handleCopyTo = async (
    skill: SkillInfo,
    destLocation: SkillLocation,
    destProjectPath: string | null,
  ) => {
    try {
      await invokeCommand("skill_copy", {
        slug: skill.slug,
        srcLocation: skill.location,
        srcProjectPath: skill.projectPath,
        destLocation,
        destProjectPath,
      });
      await useSkillStore.getState().reloadSkills();
      toast.success(`Copied "${skill.slug}" to ${destLocation}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Copy failed";
      if (msg.startsWith("CONFLICT:")) {
        toast.error(`Skill "${skill.slug}" already exists in that location`, { duration: 5000 });
      } else {
        toast.error(msg, { duration: Infinity });
      }
    }
  };

  // ── Export dialog ──
  const [exportDialog, setExportDialog] = useState<ExportDialogState>({
    open: false, skill: null, destPath: "~/Downloads",
  });
  const [isExporting, setIsExporting] = useState(false);

  const openExportDialog = (skill: SkillInfo) => {
    setExportDialog({ open: true, skill, destPath: "~/Downloads" });
  };

  const handleExport = async () => {
    if (!exportDialog.skill) return;
    setIsExporting(true);
    try {
      const outPath = await invokeCommand<string>("skill_export", {
        slug: exportDialog.skill.slug,
        location: exportDialog.skill.location,
        projectPath: exportDialog.skill.projectPath,
        destPath: exportDialog.destPath,
      });
      toast.success(`Exported to ${outPath}`, { duration: 5000 });
      setExportDialog((d) => ({ ...d, open: false }));
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Export failed";
      toast.error(msg, { duration: Infinity });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Import dialog ──
  const defaultImport = (): ImportDialogState => ({
    open: false, zipPath: "", location: "personal", projectPath: null,
    conflictSlug: null, conflictAction: null, renameSlug: "",
  });
  const [importDialog, setImportDialog] = useState<ImportDialogState>(defaultImport());
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async (resolution?: string) => {
    setIsImporting(true);
    try {
      const skill = await invokeCommand<SkillInfo>("skill_import", {
        zipPath: importDialog.zipPath,
        location: importDialog.location,
        projectPath: importDialog.projectPath,
        conflictResolution: resolution ?? null,
      });
      await useSkillStore.getState().reloadSkills();
      toast.success(`Imported skill "${skill.name}"`, { duration: 3000 });
      setImportDialog(defaultImport());
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Import failed";
      if (msg.startsWith("CONFLICT:")) {
        const slug = msg.slice("CONFLICT:".length) || "unknown";
        setImportDialog((d) => ({
          ...d, conflictSlug: slug, conflictAction: null, renameSlug: `${slug}-copy`,
        }));
      } else {
        toast.error(msg, { duration: Infinity });
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportResolve = async () => {
    if (!importDialog.conflictAction) return;
    const resolution = importDialog.conflictAction === "replace"
      ? "replace"
      : `rename:${importDialog.renameSlug}`;
    setImportDialog((d) => ({ ...d, conflictSlug: null, conflictAction: null }));
    await handleImport(resolution);
  };

  // Common props for SkillList instances
  const listTreeProps = {
    expandedSkillKey,
    skillTree,
    isTreeLoading,
    treeError,
    selectedFilePath,
    onToggleExpand: handleToggleExpand,
    onSelectFile: handleSelectFile,
    onCopyTo: handleCopyTo,
    availableDestinations,
  };

  return (
    <PanelGroup orientation="horizontal" className="h-full overflow-hidden">
      {/* Left panel — unified sidebar */}
      <Panel defaultSize="25%" minSize="15%" maxSize="40%">
        <div className="flex flex-col h-full overflow-hidden border-r border-zinc-800">
          <SkillCreateForm availableDestinations={availableDestinations} />

          {/* Import button */}
          <div className="px-3 py-1.5 border-b border-zinc-800 shrink-0">
            <button
              onClick={() => setImportDialog((d) => ({ ...d, open: true }))}
              className="w-full text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded px-2 py-1 transition-colors text-left"
            >
              ↑ Import skill from package…
            </button>
          </div>

          {/* Search trigger + Refresh */}
          <div className="px-3 py-1.5 border-b border-zinc-800 shrink-0 flex gap-1.5">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex-1 flex items-center gap-2 bg-zinc-800/50 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              <Search size={13} />
              <span className="flex-1 text-left">Search skills...</span>
              <kbd className="hidden sm:inline text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-500">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={() => useSkillStore.getState().reloadSkills()}
              className="flex items-center justify-center bg-zinc-800/50 border border-zinc-700 rounded px-1.5 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
              title="Refresh skills"
              aria-label="Refresh skills"
            >
              <RefreshCw size={13} />
            </button>
          </div>

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
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">Claude Code Skills</span>
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
                selectedSkillKey={selectedKey}
                onSelectSkill={handleSelectSkill}
                onToggleActive={handleToggleActive}
                onExport={openExportDialog}
                {...listTreeProps}
              />
            )}

            {/* Claude Desktop Skills */}
            {desktopSkillsCount > 0 && (
              <>
                <div className="shrink-0 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
                  <button
                    onClick={() => setDesktopSkillsExpanded((prev) => !prev)}
                    className="flex items-center gap-2 w-full text-left"
                    aria-expanded={desktopSkillsExpanded}
                    aria-label="Toggle Claude Desktop Skills section"
                  >
                    <span className="text-zinc-400 text-xs">{desktopSkillsExpanded ? "▼" : "▶"}</span>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">Claude Desktop Skills</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                      {desktopSkillsCount}
                    </span>
                  </button>
                </div>
                {desktopSkillsExpanded && (
                  <SkillList
                    skills={skills}
                    location="desktop_skills"
                    isLoading={isLoading}
                    error={error}
                    selectedSkillKey={selectedKey}
                    onSelectSkill={handleSelectSkill}
                    onToggleActive={handleToggleActive}
                    onExport={openExportDialog}
                    {...listTreeProps}
                  />
                )}
              </>
            )}

            {/* Examples (Claude Desktop) */}
            {desktopExamplesCount > 0 && (
              <>
                <div className="shrink-0 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
                  <button
                    onClick={() => setDesktopExamplesExpanded((prev) => !prev)}
                    className="flex items-center gap-2 w-full text-left"
                    aria-expanded={desktopExamplesExpanded}
                    aria-label="Toggle Examples section"
                  >
                    <span className="text-zinc-400 text-xs">{desktopExamplesExpanded ? "▼" : "▶"}</span>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">Examples</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                      {desktopExamplesCount}
                    </span>
                  </button>
                </div>
                {desktopExamplesExpanded && (
                  <SkillList
                    skills={skills}
                    location="desktop_examples"
                    isLoading={isLoading}
                    error={error}
                    selectedSkillKey={selectedKey}
                    onSelectSkill={handleSelectSkill}
                    onToggleActive={handleToggleActive}
                    onExport={openExportDialog}
                    {...listTreeProps}
                  />
                )}
              </>
            )}

            {/* Projects — grouped at the end */}
            {projectPaths.length > 0 && (
              <>
                <div className="shrink-0 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
                  <button
                    onClick={() => setProjectsGroupExpanded((prev) => !prev)}
                    className="flex items-center gap-2 w-full text-left"
                    aria-expanded={projectsGroupExpanded}
                    aria-label="Toggle Projects section"
                  >
                    <span className="text-zinc-400 text-xs">{projectsGroupExpanded ? "▼" : "▶"}</span>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">Projects</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                      {totalProjectCount > 0 ? `${totalProjectCount} Skill${totalProjectCount !== 1 ? "s" : ""}` : "Empty"}
                    </span>
                  </button>
                </div>
                {projectsGroupExpanded && projectPaths.map((pp) => {
                  const projectCount = skills.filter(
                    (s) => s.location === "project" && s.projectPath === pp
                  ).length;
                  const expanded = projectExpanded[pp] ?? true;
                  return (
                    <div key={pp}>
                      <div className="shrink-0 pl-8 pr-4 py-1.5 border-b border-zinc-800/50 bg-zinc-900/50">
                        <button
                          onClick={() => toggleProject(pp)}
                          className="flex items-center gap-2 w-full text-left"
                          aria-expanded={expanded}
                          aria-label={`Toggle Project ${pp} section`}
                        >
                          <span className="text-zinc-500 text-xs">{expanded ? "▼" : "▶"}</span>
                          <span className="text-xs font-medium text-zinc-400 flex-1 truncate">
                            {pp.split("/").pop() || pp}
                          </span>
                          <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                            {projectCount}
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
                          selectedSkillKey={selectedKey}
                          onSelectSkill={handleSelectSkill}
                          onToggleActive={handleToggleActive}
                          onExport={openExportDialog}
                          {...listTreeProps}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-emerald-500 active:bg-emerald-400 transition-colors cursor-col-resize" />

      {/* Right panel — editor only */}
      <Panel defaultSize="75%" minSize="40%">
        <div className="h-full overflow-hidden">
          {selectedSkill && selectedFilePath ? (
            <SkillFileEditor
              skill={selectedSkill}
              relPath={selectedFilePath}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-zinc-500 text-center px-8">
                {selectedSkill
                  ? "Select a file to edit"
                  : "Select a skill and file to start editing"}
              </p>
            </div>
          )}
        </div>
      </Panel>

      {/* Export dialog */}
      {exportDialog.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-[460px] shadow-xl">
            <h2 className="text-sm font-semibold text-zinc-100 mb-1">Export Skill</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Export <strong>{exportDialog.skill?.slug}</strong> as a portable zip package.
            </p>
            <label className="block text-xs text-zinc-400 mb-1">Destination directory or path</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500 font-mono"
              value={exportDialog.destPath}
              onChange={(e) => setExportDialog((d) => ({ ...d, destPath: e.target.value }))}
              placeholder="~/Downloads"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setExportDialog((d) => ({ ...d, open: false }))}
                className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || !exportDialog.destPath.trim()}
                className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded transition-colors"
              >
                {isExporting ? "Exporting…" : "Export"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import dialog */}
      {importDialog.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-[460px] shadow-xl">
            {!importDialog.conflictSlug ? (
              <>
                <h2 className="text-sm font-semibold text-zinc-100 mb-1">Import Skill</h2>
                <p className="text-xs text-zinc-400 mb-4">
                  Select a <code>.zip</code> package exported from CocuyHub.
                </p>
                <label className="block text-xs text-zinc-400 mb-1">Zip file path</label>
                <input
                  className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500 font-mono mb-3"
                  value={importDialog.zipPath}
                  onChange={(e) => setImportDialog((d) => ({ ...d, zipPath: e.target.value }))}
                  placeholder="~/Downloads/my-skill.zip"
                />
                <label className="block text-xs text-zinc-400 mb-1">Destination</label>
                <select
                  className="w-full bg-zinc-800 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-100 outline-none mb-3"
                  value={`${importDialog.location}:${importDialog.projectPath ?? ""}`}
                  onChange={(e) => {
                    const decoded = decodeDestination(e.target.value);
                    setImportDialog((d) => ({ ...d, location: decoded.location, projectPath: decoded.projectPath }));
                  }}
                >
                  {availableDestinations.map((dest) => (
                    <option key={encodeDestination(dest)} value={encodeDestination(dest)}>
                      {dest.label}
                    </option>
                  ))}
                </select>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setImportDialog(defaultImport())}
                    className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleImport()}
                    disabled={isImporting || !importDialog.zipPath.trim()}
                    className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded transition-colors"
                  >
                    {isImporting ? "Importing…" : "Import"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-zinc-100 mb-1">Conflict Detected</h2>
                <p className="text-xs text-zinc-400 mb-4">
                  Skill <strong>{importDialog.conflictSlug}</strong> already exists. Choose how to resolve:
                </p>
                <div className="flex flex-col gap-2 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="conflict"
                      checked={importDialog.conflictAction === "replace"}
                      onChange={() => setImportDialog((d) => ({ ...d, conflictAction: "replace" }))}
                    />
                    <span className="text-sm text-zinc-300">Replace existing skill</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="conflict"
                      checked={importDialog.conflictAction === "rename"}
                      onChange={() => setImportDialog((d) => ({ ...d, conflictAction: "rename" }))}
                    />
                    <span className="text-sm text-zinc-300">Import with new name:</span>
                  </label>
                  {importDialog.conflictAction === "rename" && (
                    <input
                      className="ml-6 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-100 font-mono outline-none focus:border-emerald-500"
                      value={importDialog.renameSlug}
                      onChange={(e) => setImportDialog((d) => ({ ...d, renameSlug: e.target.value }))}
                      placeholder="new-skill-name"
                    />
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setImportDialog(defaultImport())}
                    className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 border border-zinc-700 hover:border-zinc-500 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportResolve}
                    disabled={isImporting || !importDialog.conflictAction || (importDialog.conflictAction === "rename" && !importDialog.renameSlug.trim())}
                    className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded transition-colors"
                  >
                    {isImporting ? "Resolving…" : "Apply"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Search command palette */}
      <SkillSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={handleSearchNavigate}
        projectPaths={projectPaths}
      />
    </PanelGroup>
  );
}
