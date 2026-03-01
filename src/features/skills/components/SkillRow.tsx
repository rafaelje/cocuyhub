import { useState, useEffect, useRef } from "react";
import {
  FileText,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Download,
  Pencil,
  AlignLeft,
  Trash2,
  Copy,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SkillInfo, SkillLocation } from "@/types";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface CopyDestination {
  label: string;
  location: SkillLocation;
  projectPath: string | null;
}

interface SkillRowProps {
  skill: SkillInfo;
  isExpanded: boolean;
  onDelete: (slug: string) => Promise<void>;
  onRename: (oldSlug: string, newSlug: string) => Promise<void>;
  onToggleFrontmatter: (slug: string, key: string, value: string) => Promise<void>;
  onDescriptionChange: (slug: string, description: string) => Promise<void>;
  existingNames: string[];
  onSelect?: (skill: SkillInfo) => void;
  isSelected?: boolean;
  onToggleActive?: (skill: SkillInfo, active: boolean) => Promise<void>;
  onExport?: (skill: SkillInfo) => void;
  onCopyTo?: (skill: SkillInfo, destLocation: SkillLocation, destProjectPath: string | null) => void;
  availableDestinations?: CopyDestination[];
  onToggleExpand: () => void;
}

export function SkillRow({
  skill,
  isExpanded,
  onDelete,
  onRename,
  onToggleFrontmatter,
  onDescriptionChange,
  existingNames,
  onSelect,
  isSelected = false,
  onToggleActive,
  onExport,
  onCopyTo,
  availableDestinations,
  onToggleExpand,
}: SkillRowProps) {
  // Optimistic toggles
  const [optimisticModelInvocation, setOptimisticModelInvocation] = useState(!skill.disableModelInvocation);
  const [optimisticUserInvocable, setOptimisticUserInvocable] = useState(skill.userInvocable);
  const [optimisticActive, setOptimisticActive] = useState(!skill.disabled);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(skill.slug);
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState(skill.description ?? "");
  const cancelledRef = useRef(false);
  const descriptionCancelledRef = useRef(false);

  useEffect(() => { setOptimisticModelInvocation(!skill.disableModelInvocation); }, [skill.disableModelInvocation]);
  useEffect(() => { setOptimisticUserInvocable(skill.userInvocable); }, [skill.userInvocable]);
  useEffect(() => { setOptimisticActive(!skill.disabled); }, [skill.disabled]);
  useEffect(() => { setDraftName(skill.slug); }, [skill.slug]);
  useEffect(() => { setDraftDescription(skill.description ?? ""); }, [skill.description]);

  const handleRenameCommit = async () => {
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    if (draftName === skill.slug) { setEditing(false); return; }
    if (!draftName || draftName.length > 64 || !SLUG_REGEX.test(draftName)) return;
    const others = existingNames.filter((n) => n !== skill.slug);
    if (others.includes(draftName)) return;
    try {
      await onRename(skill.slug, draftName);
      setEditing(false);
    } catch { /* keep editing */ }
  };

  const handleRenameCancel = () => {
    cancelledRef.current = true;
    setEditing(false);
    setDraftName(skill.slug);
  };

  const handleDescriptionCommit = async () => {
    if (descriptionCancelledRef.current) { descriptionCancelledRef.current = false; return; }
    if (draftDescription === (skill.description ?? "")) { setDescriptionEditing(false); return; }
    try {
      await onDescriptionChange(skill.slug, draftDescription.trim());
      setDescriptionEditing(false);
    } catch { /* keep editing */ }
  };

  const handleDescriptionCancel = () => {
    descriptionCancelledRef.current = true;
    setDescriptionEditing(false);
    setDraftDescription(skill.description ?? "");
  };

  const handleModelInvocationToggle = async (checked: boolean) => {
    const prev = optimisticModelInvocation;
    setOptimisticModelInvocation(checked);
    try {
      await onToggleFrontmatter(skill.slug, "disable-model-invocation", checked ? "" : "true");
    } catch { setOptimisticModelInvocation(prev); }
  };

  const handleUserInvocableToggle = async (checked: boolean) => {
    const prev = optimisticUserInvocable;
    setOptimisticUserInvocable(checked);
    try {
      await onToggleFrontmatter(skill.slug, "user-invocable", checked ? "" : "false");
    } catch { setOptimisticUserInvocable(prev); }
  };

  const handleActiveToggle = async (checked: boolean) => {
    if (!onToggleActive) return;
    const prev = optimisticActive;
    setOptimisticActive(checked);
    try { await onToggleActive(skill, checked); } catch { setOptimisticActive(prev); }
  };

  const handleConfirmDelete = async () => {
    setDialogOpen(false);
    await onDelete(skill.slug);
  };

  const handleRowClick = () => {
    onSelect?.(skill);
    onToggleExpand();
  };

  return (
    <>
      <div
        role="treeitem"
        onClick={handleRowClick}
        className={cn(
          "group flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer",
          isSelected
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-300 hover:bg-zinc-800/60"
        )}
      >
        {/* Chevron */}
        <span className="shrink-0 text-zinc-500 w-4 flex items-center justify-center">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Icon */}
        <span className="shrink-0 text-zinc-500">
          <FileText size={14} />
        </span>

        {/* Name (editable inline) */}
        {editing ? (
          <input
            className="flex-1 min-w-0 font-mono text-sm text-zinc-100 bg-transparent border-b border-zinc-500 outline-none truncate"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleRenameCommit(); }
              if (e.key === "Escape") handleRenameCancel();
            }}
            onBlur={handleRenameCommit}
            autoFocus
            aria-label={`Rename ${skill.slug}`}
          />
        ) : descriptionEditing ? (
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="font-mono text-sm truncate">{skill.name}</span>
            <input
              className="w-full text-[11px] text-zinc-300 bg-transparent border-b border-zinc-500 outline-none"
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleDescriptionCommit(); }
                if (e.key === "Escape") handleDescriptionCancel();
              }}
              onBlur={handleDescriptionCommit}
              autoFocus
              aria-label={`Description for ${skill.slug}`}
              placeholder="Add description…"
            />
          </div>
        ) : (
          <span
            className="flex-1 min-w-0 font-mono text-sm truncate"
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setDraftName(skill.slug); }}
          >
            {skill.name}
          </span>
        )}

        {/* Disabled badge */}
        {skill.disabled && (
          <span className="shrink-0 text-[10px] text-zinc-600 bg-zinc-800 rounded px-1">off</span>
        )}

        {/* Context menu trigger — visible on hover */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 p-0.5 rounded text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-300 hover:bg-zinc-700 transition-all"
              aria-label={`Menu for ${skill.slug}`}
            >
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-zinc-400">{skill.slug}</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Toggles */}
            {onToggleActive && (
              <div className="flex items-center justify-between px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                <span className="text-sm">Active</span>
                <Switch size="sm" checked={optimisticActive} onCheckedChange={handleActiveToggle} />
              </div>
            )}
            <div className="flex items-center justify-between px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
              <span className="text-sm">Model Invocation</span>
              <Switch size="sm" checked={optimisticModelInvocation} onCheckedChange={handleModelInvocationToggle} />
            </div>
            <div className="flex items-center justify-between px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
              <span className="text-sm">User Invocable</span>
              <Switch size="sm" checked={optimisticUserInvocable} onCheckedChange={handleUserInvocableToggle} />
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => { setEditing(true); setDraftName(skill.slug); }}>
              <Pencil size={14} /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setDescriptionEditing(true); setDraftDescription(skill.description ?? ""); }}>
              <AlignLeft size={14} /> Edit Description
            </DropdownMenuItem>

            {onExport && (
              <DropdownMenuItem onSelect={() => onExport(skill)}>
                <Download size={14} /> Export
              </DropdownMenuItem>
            )}

            {onCopyTo && availableDestinations && availableDestinations.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Copy size={14} /> Copy to…
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {availableDestinations.map((dest) => (
                      <DropdownMenuItem
                        key={`${dest.location}:${dest.projectPath ?? ""}`}
                        onSelect={() => onCopyTo(skill, dest.location, dest.projectPath)}
                      >
                        {dest.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDialogOpen(true)}>
              <Trash2 size={14} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove skill?</DialogTitle>
            <DialogDescription>
              Remove <strong>{skill.slug}</strong>? This will delete the entire skill folder and cannot be undone.
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
              Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
