import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Radix ScrollArea uses ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: { getState: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Mock useAppStore
const mockSetActiveProjectPath = vi.fn();
vi.mock("@/stores/useAppStore", () => ({
  useAppStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      activeProjectPath: null,
      setActiveProjectPath: mockSetActiveProjectPath,
    };
    return selector(state);
  }),
}));

import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import { ProjectsSection } from "./ProjectsSection";
import type { ProjectConfig } from "@/types";

const mockInvokeCommand = vi.mocked(invokeCommand);
const mockReloadConfig = vi.fn().mockResolvedValue(undefined);

const projects: Record<string, ProjectConfig> = {
  "/Users/rafa/beta-project": {
    mcpServers: { "mcp-b": { command: "node", args: [] } },
  },
  "/Users/rafa/alpha-project": {
    mcpServers: { "mcp-a": { command: "python", args: [] } },
  },
  "/Users/rafa/gamma-project": {
    mcpServers: {},
  },
};

describe("ProjectsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useConfigStore).getState = vi.fn().mockReturnValue({
      reloadConfig: mockReloadConfig,
    });
    mockInvokeCommand.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders nothing when projects is empty", () => {
    const { container } = render(
      <ProjectsSection projects={{}} desktopConfig={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when projects is undefined", () => {
    const { container } = render(
      <ProjectsSection projects={undefined} desktopConfig={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders project accordions sorted alphabetically", () => {
    render(<ProjectsSection projects={projects} desktopConfig={null} />);
    const buttons = screen.getAllByRole("button", { name: /Toggle project/i });
    const names = buttons.map((b) => b.textContent?.trim() ?? "");
    expect(names[0]).toContain("alpha-project");
    expect(names[1]).toContain("beta-project");
    expect(names[2]).toContain("gamma-project");
  });

  it("first project is expanded by default when localStorage is empty", () => {
    render(<ProjectsSection projects={projects} desktopConfig={null} />);
    // First alphabetically is alpha-project — its button should have aria-expanded=true
    const alphaBtn = screen.getByRole("button", { name: "Toggle project alpha-project" });
    expect(alphaBtn.getAttribute("aria-expanded")).toBe("true");
    const betaBtn = screen.getByRole("button", { name: "Toggle project beta-project" });
    expect(betaBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("persists expanded state to localStorage on toggle", async () => {
    render(<ProjectsSection projects={projects} desktopConfig={null} />);
    const betaBtn = screen.getByRole("button", { name: "Toggle project beta-project" });
    await userEvent.click(betaBtn);
    const stored = JSON.parse(localStorage.getItem("config:expanded-projects") ?? "[]");
    expect(stored).toContain("/Users/rafa/beta-project");
  });

  it("restores expanded state from localStorage", () => {
    localStorage.setItem(
      "config:expanded-projects",
      JSON.stringify(["/Users/rafa/beta-project"])
    );
    render(<ProjectsSection projects={projects} desktopConfig={null} />);
    const betaBtn = screen.getByRole("button", { name: "Toggle project beta-project" });
    expect(betaBtn.getAttribute("aria-expanded")).toBe("true");
    const alphaBtn = screen.getByRole("button", { name: "Toggle project alpha-project" });
    expect(alphaBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("Expand All expands all accordions", async () => {
    render(<ProjectsSection projects={projects} desktopConfig={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Expand All" }));
    const toggleBtns = screen.getAllByRole("button", { name: /Toggle project/i });
    toggleBtns.forEach((btn) => {
      expect(btn.getAttribute("aria-expanded")).toBe("true");
    });
  });

  it("Collapse All collapses all accordions", async () => {
    render(<ProjectsSection projects={projects} desktopConfig={null} />);
    // First expand all
    await userEvent.click(screen.getByRole("button", { name: "Expand All" }));
    // Then collapse all
    await userEvent.click(screen.getByRole("button", { name: "Collapse All" }));
    const toggleBtns = screen.getAllByRole("button", { name: /Toggle project/i });
    toggleBtns.forEach((btn) => {
      expect(btn.getAttribute("aria-expanded")).toBe("false");
    });
    expect(mockSetActiveProjectPath).toHaveBeenCalledWith(null);
  });

  it("calls project_delete and reloads config when project is deleted", async () => {
    render(<ProjectsSection projects={projects} desktopConfig={null} />);
    // Click delete on alpha-project
    await userEvent.click(
      screen.getByRole("button", { name: "Delete project alpha-project" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockInvokeCommand).toHaveBeenCalledWith("project_delete", {
      projectPath: "/Users/rafa/alpha-project",
    });
    expect(mockReloadConfig).toHaveBeenCalledWith("code");
  });
});
