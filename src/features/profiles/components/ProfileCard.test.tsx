import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileCard } from "./ProfileCard";
import type { Profile } from "@/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const makeProfile = (id: string, name: string, mcpCount = 2): Profile => ({
  id,
  name,
  activeMcps: Array.from({ length: mcpCount }, (_, i) => `mcp-${i}`),
  createdAt: "2026-01-01T00:00:00Z",
});

describe("ProfileCard", () => {
  const mockOnSwitch = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders profile name", () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work", 3)}
        isActive={false}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText("Work")).not.toBeNull();
  });

  it("renders MCP count", () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work", 3)}
        isActive={false}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText("3 MCPs")).not.toBeNull();
  });

  it("renders 'Active' badge when isActive is true", () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work")}
        isActive={true}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByText("Active")).not.toBeNull();
  });

  it("does not render 'Active' badge when isActive is false", () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work")}
        isActive={false}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.queryByText("Active")).toBeNull();
  });

  it("Switch button is shown when not active", () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work")}
        isActive={false}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.getByRole("button", { name: "Switch" })).not.toBeNull();
  });

  it("Switch button is NOT shown when isActive is true", () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work")}
        isActive={true}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    expect(screen.queryByRole("button", { name: "Switch" })).toBeNull();
  });

  it("clicking Switch calls onSwitch", async () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work")}
        isActive={false}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(mockOnSwitch).toHaveBeenCalledTimes(1);
  });

  it("Edit and Delete buttons are not disabled", () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work")}
        isActive={false}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    const editBtn = screen.getByRole("button", { name: "Edit" }) as HTMLButtonElement;
    const deleteBtn = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(editBtn.disabled).toBe(false);
    expect(deleteBtn.disabled).toBe(false);
  });

  it("clicking Edit calls onEdit", async () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work")}
        isActive={false}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it("clicking Delete calls onDelete", async () => {
    render(
      <ProfileCard
        profile={makeProfile("p1", "Work")}
        isActive={false}
        onSwitch={mockOnSwitch}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockOnDelete).toHaveBeenCalledTimes(1);
  });
});
