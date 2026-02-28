import { useState, useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import type { SkillInfo } from "@/types";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface SkillRowProps {
  skill: SkillInfo;
  onDelete: (slug: string) => Promise<void>;
  onRename: (oldSlug: string, newSlug: string) => Promise<void>;
  onToggleFrontmatter: (slug: string, key: string, value: string) => Promise<void>;
  onDescriptionChange: (slug: string, description: string) => Promise<void>;
  existingNames: string[];
  onSelect?: (skill: SkillInfo) => void;
  isSelected?: boolean;
  onToggleActive?: (skill: SkillInfo, active: boolean) => Promise<void>;
  onExport?: (skill: SkillInfo) => void;
}

export function SkillRow({
  skill,
  onDelete,
  onRename,
  onToggleFrontmatter,
  onDescriptionChange,
  existingNames,
  onSelect,
  isSelected = false,
  onToggleActive,
  onExport,
}: SkillRowProps) {
  // Model Invocation toggle: inverted logic — checked=enabled means disable-model-invocation is false
  const [optimisticModelInvocation, setOptimisticModelInvocation] = useState(!skill.disableModelInvocation);
  // User Invocable toggle: direct logic
  const [optimisticUserInvocable, setOptimisticUserInvocable] = useState(skill.userInvocable);
  // Active toggle: inverted of disabled
  const [optimisticActive, setOptimisticActive] = useState(!skill.disabled);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(skill.slug);
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState(skill.description ?? "");
  const cancelledRef = useRef(false);
  const descriptionCancelledRef = useRef(false);

  useEffect(() => {
    setOptimisticModelInvocation(!skill.disableModelInvocation);
  }, [skill.disableModelInvocation]);

  useEffect(() => {
    setOptimisticUserInvocable(skill.userInvocable);
  }, [skill.userInvocable]);

  useEffect(() => {
    setOptimisticActive(!skill.disabled);
  }, [skill.disabled]);

  useEffect(() => {
    setDraftName(skill.slug);
  }, [skill.slug]);

  useEffect(() => {
    setDraftDescription(skill.description ?? "");
  }, [skill.description]);

  const handleRenameCommit = async () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    if (draftName === skill.slug) {
      setEditing(false);
      return;
    }
    if (!draftName || draftName.length > 64 || !SLUG_REGEX.test(draftName)) {
      // Invalid — don't commit, keep editing
      return;
    }
    const others = existingNames.filter((n) => n !== skill.slug);
    if (others.includes(draftName)) {
      return;
    }
    try {
      await onRename(skill.slug, draftName);
      setEditing(false);
    } catch {
      // keep editing open
    }
  };

  const handleRenameCancel = () => {
    cancelledRef.current = true;
    setEditing(false);
    setDraftName(skill.slug);
  };

  const handleDescriptionCommit = async () => {
    if (descriptionCancelledRef.current) {
      descriptionCancelledRef.current = false;
      return;
    }
    if (draftDescription === (skill.description ?? "")) {
      setDescriptionEditing(false);
      return;
    }
    try {
      await onDescriptionChange(skill.slug, draftDescription.trim());
      setDescriptionEditing(false);
    } catch {
      // keep editing open
    }
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
      // Inverted: checked=true means disable-model-invocation should be false/removed
      if (checked) {
        await onToggleFrontmatter(skill.slug, "disable-model-invocation", "");
      } else {
        await onToggleFrontmatter(skill.slug, "disable-model-invocation", "true");
      }
    } catch {
      setOptimisticModelInvocation(prev);
    }
  };

  const handleUserInvocableToggle = async (checked: boolean) => {
    const prev = optimisticUserInvocable;
    setOptimisticUserInvocable(checked);
    try {
      if (checked) {
        // true is default, remove the field
        await onToggleFrontmatter(skill.slug, "user-invocable", "");
      } else {
        await onToggleFrontmatter(skill.slug, "user-invocable", "false");
      }
    } catch {
      setOptimisticUserInvocable(prev);
    }
  };

  const handleActiveToggle = async (checked: boolean) => {
    if (!onToggleActive) return;
    const prev = optimisticActive;
    setOptimisticActive(checked);
    try {
      await onToggleActive(skill, checked);
    } catch {
      setOptimisticActive(prev);
    }
  };

  const handleConfirmDelete = async () => {
    setDialogOpen(false);
    await onDelete(skill.slug);
  };

  const locationLabel =
    skill.location === "personal"
      ? "Personal"
      : skill.projectPath
        ? skill.projectPath.split("/").slice(-2).join("/")
        : "Project";

  return (
    <div
      role="article"
      onClick={() => onSelect?.(skill)}
      className={cn(
        "flex flex-col px-4 py-3 border-b border-zinc-800 transition-colors",
        isSelected
          ? "bg-zinc-700 border-l-2 border-l-emerald-500"
          : "bg-zinc-900 hover:bg-zinc-800 cursor-pointer"
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-3">
        {editing ? (
          <input
            className="flex-1 font-mono text-sm text-zinc-100 bg-transparent border-b border-zinc-500 outline-none truncate"
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
        ) : (
          <code
            className="flex-1 font-mono text-sm text-zinc-100 truncate"
            onDoubleClick={() => { setEditing(true); setDraftName(skill.slug); }}
          >
            {skill.name}
          </code>
        )}
        <Badge variant="secondary" className="shrink-0">
          {locationLabel}
        </Badge>
        {onToggleActive && (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] text-zinc-500">Active</span>
            <Switch
              size="sm"
              checked={optimisticActive}
              onCheckedChange={handleActiveToggle}
              aria-label={`Active for ${skill.slug}`}
            />
          </div>
        )}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] text-zinc-500">Model</span>
          <Switch
            size="sm"
            checked={optimisticModelInvocation}
            onCheckedChange={handleModelInvocationToggle}
            aria-label={`Model Invocation for ${skill.slug}`}
          />
        </div>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] text-zinc-500">User</span>
          <Switch
            size="sm"
            checked={optimisticUserInvocable}
            onCheckedChange={handleUserInvocableToggle}
            aria-label={`User Invocable for ${skill.slug}`}
          />
        </div>
        {onExport && (
          <button
            onClick={(e) => { e.stopPropagation(); onExport(skill); }}
            aria-label={`Export ${skill.slug}`}
            className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors rounded"
            title="Export skill"
          >
            <Download size={13} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
          aria-label={`Remove ${skill.slug}`}
          className="ml-1 p-1 text-zinc-500 hover:text-red-400 transition-colors rounded"
        >
          ✕
        </button>
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
      </div>
      {/* Description line */}
      {descriptionEditing ? (
        <input
          className="mt-0.5 w-full text-xs text-zinc-300 bg-transparent border-b border-zinc-500 outline-none"
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
      ) : (
        <span
          className={cn(
            "mt-0.5 text-xs cursor-text",
            skill.description ? "text-zinc-400" : "text-zinc-600"
          )}
          onClick={() => { setDescriptionEditing(true); setDraftDescription(skill.description ?? ""); }}
          aria-label={skill.description ? `Description: ${skill.description}` : `Add description for ${skill.slug}`}
        >
          {skill.description || "Add description…"}
        </span>
      )}
      {/* Body preview */}
      {skill.bodyPreview && (
        <span className="mt-1 text-xs text-zinc-600 line-clamp-2">
          {skill.bodyPreview}
        </span>
      )}
    </div>
  );
}
