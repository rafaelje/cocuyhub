import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn().mockResolvedValue([]) }));

import { useSkillStore } from "@/stores/useSkillStore";
import { SkillSearchDialog } from "./SearchResults";
import type { SkillInfo, SkillSearchResult } from "@/types";

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

const sampleSkill: SkillInfo = {
  name: "code-review",
  slug: "code-review",
  description: "Review pull requests",
  disableModelInvocation: false,
  userInvocable: true,
  allowedTools: null,
  argumentHint: null,
  location: "personal",
  projectPath: null,
  bodyPreview: null,
  disabled: false,
};

const sampleResult: SkillSearchResult = {
  skill: sampleSkill,
  matches: [
    { field: "name", filePath: null, context: "code-review", line: null },
    { field: "description", filePath: null, context: "Review pull requests", line: null },
  ],
  score: 150,
};

function resetStore() {
  useSkillStore.setState({
    searchQuery: "",
    searchResults: [],
    isSearching: false,
    searchError: null,
  });
}

/**
 * Type into the input to set localQuery, then immediately set store results.
 * This ensures the component's `hasQuery` check (based on localQuery) is true.
 */
async function typeAndSetResults(
  query: string,
  results: SkillSearchResult[],
  extra: Record<string, unknown> = {},
) {
  const input = screen.getByPlaceholderText("Search by name, description, filename, or content...");
  await userEvent.type(input, query);
  act(() => {
    useSkillStore.setState({ searchQuery: query, searchResults: results, isSearching: false, ...extra } as never);
  });
}

describe("SkillSearchDialog", () => {
  const onClose = vi.fn();
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  const renderDialog = (open = true) =>
    render(
      <SkillSearchDialog
        open={open}
        onClose={onClose}
        onNavigate={onNavigate}
        projectPaths={[]}
      />,
    );

  // ── Basic rendering ──

  it("renders nothing when open=false", () => {
    const { container } = renderDialog(false);
    expect(container.innerHTML).toBe("");
  });

  it("renders the search input when open", () => {
    renderDialog();
    expect(
      screen.getByPlaceholderText("Search by name, description, filename, or content..."),
    ).not.toBeNull();
  });

  it("shows empty state with badge hints when no query", () => {
    renderDialog();
    expect(screen.getByText("Type to search across all skills")).not.toBeNull();
  });

  it("renders ESC badge", () => {
    renderDialog();
    expect(screen.getByText("ESC")).not.toBeNull();
  });

  // ── Loading & error states ──

  it("shows loading skeleton when searching", () => {
    renderDialog();
    act(() => { useSkillStore.setState({ isSearching: true } as never); });
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  it("shows error message when search fails", () => {
    renderDialog();
    act(() => { useSkillStore.setState({ searchError: "Backend error" } as never); });
    expect(screen.getByText(/Search failed: Backend error/)).not.toBeNull();
  });

  // ── No results ──

  it("shows no results message for empty results with query", async () => {
    renderDialog();
    await typeAndSetResults("zzz", []);
    expect(screen.getByText(/No skills match/)).not.toBeNull();
  });

  // ── Results rendering ──

  it("renders search results with skill name and location badge", async () => {
    renderDialog();
    await typeAndSetResults("code", [sampleResult]);
    expect(screen.getByText("code-review")).not.toBeNull();
    expect(screen.getByText("Personal")).not.toBeNull();
  });

  it("renders match badges for each match type", async () => {
    renderDialog();
    await typeAndSetResults("code", [sampleResult]);
    // Use getAllByText since badge text may appear in hints area too
    const nameBadges = screen.getAllByText("name");
    expect(nameBadges.length).toBeGreaterThanOrEqual(1);
    const descBadges = screen.getAllByText("description");
    expect(descBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows result count in footer", async () => {
    renderDialog();
    await typeAndSetResults("code", [sampleResult]);
    expect(screen.getByText("1 result")).not.toBeNull();
  });

  it("shows pluralized result count", async () => {
    const secondResult: SkillSearchResult = {
      skill: { ...sampleSkill, slug: "other", name: "other" },
      matches: [{ field: "content", filePath: "/notes.md", context: "code here", line: 5 }],
      score: 10,
    };
    renderDialog();
    await typeAndSetResults("code", [sampleResult, secondResult]);
    expect(screen.getByText("2 results")).not.toBeNull();
  });

  it("shows skill description when available", async () => {
    renderDialog();
    await typeAndSetResults("code", [sampleResult]);
    expect(screen.getByText("Review pull requests")).not.toBeNull();
  });

  it("shows content snippet with file path and line", async () => {
    const resultWithContent: SkillSearchResult = {
      skill: sampleSkill,
      matches: [
        { field: "content", filePath: "/helpers.ts", context: "function doStuff()", line: 42 },
      ],
      score: 10,
    };
    renderDialog();
    await typeAndSetResults("doStuff", [resultWithContent]);
    expect(screen.getByText(/\/helpers\.ts/)).not.toBeNull();
    expect(screen.getByText(/:42/)).not.toBeNull();
    expect(screen.getByText("function doStuff()")).not.toBeNull();
  });

  it("shows +N more when matches exceed MAX_VISIBLE_BADGES", async () => {
    const manyMatches: SkillSearchResult = {
      skill: sampleSkill,
      matches: [
        { field: "name", filePath: null, context: "code-review", line: null },
        { field: "description", filePath: null, context: "Review", line: null },
        { field: "body", filePath: "/SKILL.md", context: "body text", line: null },
        { field: "filename", filePath: "/config.json", context: "config.json", line: null },
        { field: "content", filePath: "/notes.md", context: "match", line: 1 },
      ],
      score: 210,
    };
    renderDialog();
    await typeAndSetResults("code", [manyMatches]);
    expect(screen.getByText("+2 more")).not.toBeNull();
  });

  it("renders location badge for different locations", async () => {
    const desktopSkill: SkillInfo = { ...sampleSkill, location: "desktop_skills" };
    const desktopResult: SkillSearchResult = {
      skill: desktopSkill,
      matches: [{ field: "name", filePath: null, context: "code-review", line: null }],
      score: 100,
    };
    renderDialog();
    await typeAndSetResults("code", [desktopResult]);
    expect(screen.getByText("Desktop")).not.toBeNull();
  });

  // ── Keyboard hints ──

  it("renders keyboard hints in footer when results present", async () => {
    renderDialog();
    await typeAndSetResults("code", [sampleResult]);
    expect(screen.getByText("navigate")).not.toBeNull();
    expect(screen.getByText("open")).not.toBeNull();
    expect(screen.getByText("close")).not.toBeNull();
  });

  // ── User interactions ──

  it("calls onNavigate and onClose when a result is clicked", async () => {
    renderDialog();
    await typeAndSetResults("code", [sampleResult]);

    await userEvent.click(screen.getByText("code-review"));

    expect(onNavigate).toHaveBeenCalledWith(sampleSkill);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", () => {
    renderDialog();
    const backdrop = document.querySelector(".fixed.inset-0.z-50");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    renderDialog();
    const input = screen.getByPlaceholderText("Search by name, description, filename, or content...");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  // ── Keyboard navigation ──

  it("navigates results with arrow keys and Enter", async () => {
    const secondSkill: SkillInfo = { ...sampleSkill, slug: "deploy", name: "deploy" };
    const results: SkillSearchResult[] = [
      sampleResult,
      { skill: secondSkill, matches: [{ field: "name", filePath: null, context: "deploy", line: null }], score: 100 },
    ];
    renderDialog();
    await typeAndSetResults("code", results);

    const input = screen.getByPlaceholderText("Search by name, description, filename, or content...");

    // Arrow down to second result, then Enter
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onNavigate).toHaveBeenCalledWith(secondSkill);
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter selects first result by default", async () => {
    renderDialog();
    await typeAndSetResults("code", [sampleResult]);

    const input = screen.getByPlaceholderText("Search by name, description, filename, or content...");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onNavigate).toHaveBeenCalledWith(sampleSkill);
  });

  it("ArrowUp does not go below index 0", async () => {
    renderDialog();
    await typeAndSetResults("code", [sampleResult]);

    const input = screen.getByPlaceholderText("Search by name, description, filename, or content...");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    // Should still select first (index 0)
    expect(onNavigate).toHaveBeenCalledWith(sampleSkill);
  });
});
