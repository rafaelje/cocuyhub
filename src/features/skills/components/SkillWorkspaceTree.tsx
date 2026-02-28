import { useState, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeCommand } from "@/lib/ipc";
import { useSkillStore } from "@/stores/useSkillStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { SkillTreeNode, SkillInfo } from "@/types";

interface SkillWorkspaceTreeProps {
  tree: SkillTreeNode;
  skill: SkillInfo;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
}

interface TreeNodeProps {
  node: SkillTreeNode;
  skill: SkillInfo;
  expanded: Set<string>;
  selectedPath: string | null;
  selectedFilePath: string | null;
  renamingPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onRenameStart: (path: string | null) => void;
  onDelete: (path: string, isDir: boolean) => void;
  onSelectFile: (path: string) => void;
  depth: number;
}

function TreeNode({
  node,
  skill,
  expanded,
  selectedPath,
  selectedFilePath,
  renamingPath,
  onToggle,
  onSelect,
  onRenameStart,
  onDelete,
  onSelectFile,
  depth,
}: TreeNodeProps) {
  const isDir = node.nodeType === "dir";
  const isExpanded = expanded.has(node.path);
  const isSelected = selectedPath === node.path;
  const isFileSelected = selectedFilePath === node.path;
  const isRenaming = renamingPath === node.path;
  const [draftName, setDraftName] = useState(node.name);
  const cancelledRef = useRef(false);
  const { reloadTree } = useSkillStore();

  const handleClick = () => {
    onSelect(node.path);
    if (isDir) {
      onToggle(node.path);
    } else {
      onSelectFile(node.path);
    }
  };

  const handleRenameCommit = async () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      onRenameStart(null); // exit rename mode on cancel
      return;
    }
    if (draftName === node.name || !draftName.trim()) {
      onRenameStart(null); // exit rename mode with no change
      return;
    }
    try {
      await invokeCommand("skill_node_rename", {
        slug: skill.slug,
        location: skill.location,
        projectPath: skill.projectPath,
        relPath: node.path,
        newName: draftName.trim(),
      });
      onRenameStart(null); // exit rename mode on success (tree reload replaces node)
      await reloadTree();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Rename failed";
      toast.error(msg, { duration: Infinity });
      setDraftName(node.name);
      onRenameStart(null); // exit rename mode on error too
    }
  };

  const handleRenameCancel = () => {
    cancelledRef.current = true;
    setDraftName(node.name);
    // onRenameStart(null) will be called by handleRenameCommit when onBlur fires
  };

  const canDelete = node.path !== "/" && node.path !== "/SKILL.md";
  const canRename = node.path !== "/" && node.path !== "/SKILL.md";

  if (isRenaming) {
    return (
      <div style={{ paddingLeft: `${8 + depth * 16}px` }}>
        <input
          className="w-full font-mono text-xs text-zinc-100 bg-zinc-700 border border-zinc-500 rounded px-1 py-0.5 outline-none"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleRenameCommit(); }
            if (e.key === "Escape") handleRenameCancel();
          }}
          onBlur={handleRenameCommit}
          autoFocus
          aria-label={`Rename ${node.name}`}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 w-full text-left px-2 py-0.5 text-sm rounded transition-colors",
          isFileSelected ? "bg-emerald-800/40 text-zinc-100" :
          isSelected ? "bg-zinc-700 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800",
          "cursor-pointer"
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={handleClick}
        onDoubleClick={() => canRename && onRenameStart(node.path)}
        role="treeitem"
        aria-label={node.name}
        aria-expanded={isDir ? isExpanded : undefined}
      >
        {isDir ? (
          <>
            <span className="shrink-0 text-zinc-500 w-4">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <span className="shrink-0 text-zinc-400">
              {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
            </span>
          </>
        ) : (
          <>
            <span className="shrink-0 w-4" />
            <span className="shrink-0 text-zinc-500">
              <FileText size={14} />
            </span>
          </>
        )}
        <span className="truncate font-mono text-xs flex-1">{node.name}</span>
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.path, isDir); }}
            className="hidden group-hover:flex shrink-0 p-0.5 text-zinc-600 hover:text-red-400 transition-colors rounded"
            aria-label={`Delete ${node.name}`}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {isDir && isExpanded && node.children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          skill={skill}
          expanded={expanded}
          selectedPath={selectedPath}
          selectedFilePath={selectedFilePath}
          renamingPath={renamingPath}
          onToggle={onToggle}
          onSelect={onSelect}
          onRenameStart={onRenameStart}
          onDelete={onDelete}
          onSelectFile={onSelectFile}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export function SkillWorkspaceTree({ tree, skill, selectedFilePath, onSelectFile }: SkillWorkspaceTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["/"]))
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; isDir: boolean } | null>(null)
  const [isCreating, setIsCreating] = useState<"file" | "dir" | null>(null)
  const [newName, setNewName] = useState("")
  const { reloadTree } = useSkillStore()

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  // Determine the parent dir for creation (selected dir, or root if file selected)
  const creationParent = (() => {
    if (!selectedPath || selectedPath === "/") return "/"
    // Find the node for selectedPath
    function findNode(node: SkillTreeNode, path: string): SkillTreeNode | null {
      if (node.path === path) return node
      for (const c of node.children) {
        const found = findNode(c, path)
        if (found) return found
      }
      return null
    }
    const node = findNode(tree, selectedPath)
    if (node && node.nodeType === "dir") return selectedPath
    // It's a file — use its parent
    return selectedPath.substring(0, selectedPath.lastIndexOf("/")) || "/"
  })()

  const handleCreate = async () => {
    if (!newName.trim() || !isCreating) return
    try {
      await invokeCommand("skill_node_create", {
        slug: skill.slug,
        location: skill.location,
        projectPath: skill.projectPath,
        parentRelPath: creationParent,
        name: newName.trim(),
        nodeType: isCreating,
      })
      await reloadTree()
      setIsCreating(null)
      setNewName("")
      toast.success(`Created ${isCreating === "dir" ? "folder" : "file"} "${newName.trim()}"`)
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Create failed"
      toast.error(msg, { duration: Infinity })
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await invokeCommand("skill_node_delete", {
        slug: skill.slug,
        location: skill.location,
        projectPath: skill.projectPath,
        relPath: deleteTarget.path,
      })
      await reloadTree()
      if (selectedPath === deleteTarget.path) setSelectedPath(null)
      toast.success("Deleted")
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Delete failed"
      toast.error(msg, { duration: Infinity })
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 shrink-0">
        <button
          onClick={() => { setIsCreating("dir"); setNewName(""); }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
          title={`New Folder in ${creationParent}`}
          aria-label="New Folder"
        >
          <FolderPlus size={13} />
          <span>Folder</span>
        </button>
        <button
          onClick={() => { setIsCreating("file"); setNewName(""); }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
          title={`New File in ${creationParent}`}
          aria-label="New File"
        >
          <FilePlus size={13} />
          <span>File</span>
        </button>
        <span className="ml-auto text-[10px] text-zinc-600 truncate max-w-[90px]" title={`in ${creationParent}`}>
          in {creationParent}
        </span>
      </div>

      {/* New item input */}
      {isCreating && (
        <div className="px-2 py-1.5 border-b border-zinc-800 shrink-0 flex items-center gap-2">
          <span className="text-xs text-zinc-500">{isCreating === "dir" ? "Folder:" : "File:"}</span>
          <input
            className="flex-1 text-xs font-mono text-zinc-100 bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 outline-none focus:border-emerald-500"
            placeholder={isCreating === "dir" ? "folder-name" : "file.md"}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
              if (e.key === "Escape") { setIsCreating(null); setNewName(""); }
            }}
            autoFocus
            aria-label={`New ${isCreating} name`}
          />
          <button
            onClick={handleCreate}
            className="text-xs px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
          >
            Create
          </button>
          <button
            onClick={() => { setIsCreating(null); setNewName(""); }}
            className="text-xs px-2 py-0.5 text-zinc-400 hover:text-zinc-100 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1" role="tree" aria-label="Skill workspace tree">
        <TreeNode
          node={tree}
          skill={skill}
          expanded={expanded}
          selectedPath={selectedPath}
          selectedFilePath={selectedFilePath}
          renamingPath={renamingPath}
          onToggle={toggle}
          onSelect={setSelectedPath}
          onRenameStart={setRenamingPath}
          onDelete={(path, isDir) => setDeleteTarget({ path, isDir })}
          onSelectFile={onSelectFile}
          depth={0}
        />
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.isDir ? "folder" : "file"}?</DialogTitle>
            <DialogDescription>
              Delete <strong>{deleteTarget?.path}</strong>?
              {deleteTarget?.isDir && " This will delete all contents recursively."}
              {" "}This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className="px-3 py-1.5 text-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded border border-zinc-700 hover:border-zinc-500">
                Cancel
              </button>
            </DialogClose>
            <button
              onClick={handleDeleteConfirm}
              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white transition-colors rounded"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
