import { useState, useRef, useEffect, useCallback } from "react";
import { useSkillStore } from "@/stores/useSkillStore";
import type { SkillInfo, SearchMatch } from "@/types";
import { Search, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const LOCATION_LABELS: Record<string, string> = {
  personal: "Personal",
  desktop_skills: "Desktop",
  desktop_examples: "Example",
  project: "Project",
};

const FIELD_BADGE_STYLES: Record<string, string> = {
  name: "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
  description: "bg-blue-900/50 text-blue-300 border-blue-700/50",
  body: "bg-purple-900/50 text-purple-300 border-purple-700/50",
  filename: "bg-amber-900/50 text-amber-300 border-amber-700/50",
  content: "bg-zinc-800 text-zinc-300 border-zinc-600/50",
};

const MAX_VISIBLE_BADGES = 3;

function MatchBadge({ match }: { match: SearchMatch }) {
  const style = FIELD_BADGE_STYLES[match.field] ?? FIELD_BADGE_STYLES.content;
  return (
    <span className={cn("inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border", style)}>
      {match.field}
    </span>
  );
}

interface SkillSearchDialogProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (skill: SkillInfo) => void;
  projectPaths: string[];
}

export function SkillSearchDialog({ open, onClose, onNavigate, projectPaths }: SkillSearchDialogProps) {
  const { searchResults = [], isSearching, searchError, searchQuery, searchSkills, clearSearch } = useSkillStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setLocalQuery("");
      setActiveIndex(0);
      clearSearch();
      // Small delay to let dialog render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, clearSearch]);

  const handleInputChange = useCallback(
    (value: string) => {
      setLocalQuery(value);
      setActiveIndex(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) {
        clearSearch();
        return;
      }
      debounceRef.current = setTimeout(() => {
        searchSkills(value.trim(), projectPaths);
      }, 300);
    },
    [clearSearch, searchSkills, projectPaths],
  );

  const handleSelect = useCallback(
    (skill: SkillInfo) => {
      clearSearch();
      onNavigate(skill);
      onClose();
    },
    [clearSearch, onNavigate, onClose],
  );

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, searchResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const result = searchResults[activeIndex];
        if (result) handleSelect(result.skill);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [searchResults, activeIndex, handleSelect, onClose],
  );

  if (!open) return null;

  const hasQuery = localQuery.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          {isSearching ? (
            <Loader2 size={16} className="shrink-0 text-zinc-400 animate-spin" />
          ) : (
            <Search size={16} className="shrink-0 text-zinc-400" />
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder="Search by name, description, filename, or content..."
            value={localQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          <kbd className="hidden sm:inline-flex shrink-0 items-center gap-0.5 text-[10px] text-zinc-500 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results area */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {/* Error */}
          {searchError && (
            <div className="px-4 py-3 text-sm text-red-400">
              Search failed: {searchError}
            </div>
          )}

          {/* Loading skeleton */}
          {isSearching && searchResults.length === 0 && (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex flex-col gap-1.5">
                  <div className="h-4 bg-zinc-800 rounded w-3/4" />
                  <div className="h-3 bg-zinc-800/50 rounded w-1/2 ml-6" />
                </div>
              ))}
            </div>
          )}

          {/* No results */}
          {hasQuery && !isSearching && !searchError && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <p className="text-sm text-zinc-500">No skills match "<span className="text-zinc-400">{searchQuery}</span>"</p>
            </div>
          )}

          {/* Empty state - no query yet */}
          {!hasQuery && (
            <div className="flex flex-col items-center justify-center py-8 px-4 gap-2">
              <p className="text-xs text-zinc-500">Type to search across all skills</p>
              <div className="flex gap-2 flex-wrap justify-center">
                {["name", "description", "filename", "content"].map((f) => (
                  <span key={f} className={cn("text-[10px] px-1.5 py-0.5 rounded border", FIELD_BADGE_STYLES[f])}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {searchResults.map((result, index) => {
            const { skill, matches } = result;
            const visibleBadges = matches.slice(0, MAX_VISIBLE_BADGES);
            const remaining = matches.length - MAX_VISIBLE_BADGES;
            const snippetMatch = matches.find(
              (m) => m.field === "content" || m.field === "body",
            );
            const isActive = index === activeIndex;

            return (
              <div
                key={`${skill.location}:${skill.projectPath ?? ""}:${skill.slug}`}
                data-index={index}
                onClick={() => handleSelect(skill)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex flex-col gap-1 px-4 py-2.5 cursor-pointer transition-colors border-b border-zinc-800/50",
                  isActive ? "bg-zinc-800" : "hover:bg-zinc-800/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} className="shrink-0 text-zinc-500" />
                  <span className="flex-1 min-w-0 font-mono text-sm text-zinc-200 truncate">
                    {skill.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-500 bg-zinc-800 border border-zinc-700/50 px-1.5 py-0.5 rounded">
                    {LOCATION_LABELS[skill.location] ?? skill.location}
                  </span>
                </div>

                {/* Description one-liner if available */}
                {skill.description && (
                  <p className="ml-6 text-xs text-zinc-500 truncate">{skill.description}</p>
                )}

                {/* Match badges */}
                <div className="flex items-center gap-1 ml-6">
                  {visibleBadges.map((m, i) => (
                    <MatchBadge key={`${m.field}-${m.filePath ?? ""}-${i}`} match={m} />
                  ))}
                  {remaining > 0 && (
                    <span className="text-[10px] text-zinc-500">+{remaining} more</span>
                  )}
                </div>

                {/* Context snippet for content/body */}
                {snippetMatch && (
                  <p className="ml-6 text-xs text-zinc-400 italic truncate">
                    {snippetMatch.filePath && (
                      <span className="text-zinc-500 not-italic mr-1">
                        {snippetMatch.filePath}
                        {snippetMatch.line != null && `:${snippetMatch.line}`}
                      </span>
                    )}
                    {snippetMatch.context}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer hints */}
        {searchResults.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-zinc-800 bg-zinc-900/80">
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5">↵</kbd> open
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <kbd className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5">esc</kbd> close
            </span>
            <span className="ml-auto text-[10px] text-zinc-600">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
