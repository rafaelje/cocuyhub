import { describe, it, expect } from "vitest";
import { buildDestinations, encodeDestination, decodeDestination } from "./destinations";
import type { SkillInfo } from "@/types";

function makeSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "test",
    slug: "test",
    description: null,
    disableModelInvocation: false,
    userInvocable: true,
    allowedTools: null,
    argumentHint: null,
    location: "personal",
    projectPath: null,
    bodyPreview: null,
    disabled: false,
    ...overrides,
  };
}

describe("buildDestinations", () => {
  it("always includes personal", () => {
    const dests = buildDestinations([], []);
    expect(dests).toHaveLength(1);
    expect(dests[0]).toEqual({ label: "Claude Code Skills", location: "personal", projectPath: null });
  });

  it("includes desktop_skills only when skills have that location", () => {
    const skills = [makeSkill({ location: "desktop_skills" })];
    const dests = buildDestinations(skills, []);
    expect(dests).toHaveLength(2);
    expect(dests[1].location).toBe("desktop_skills");
    expect(dests[1].label).toBe("Claude Desktop Skills");
  });

  it("does not include desktop_skills when no skills have that location", () => {
    const skills = [makeSkill({ location: "personal" })];
    const dests = buildDestinations(skills, []);
    expect(dests).toHaveLength(1);
  });

  it("includes projects with short labels", () => {
    const dests = buildDestinations([], ["/Users/joe/projects/my-app"]);
    expect(dests).toHaveLength(2);
    expect(dests[1]).toEqual({
      label: "Project: projects/my-app",
      location: "project",
      projectPath: "/Users/joe/projects/my-app",
    });
  });

  it("includes desktop_skills and multiple projects", () => {
    const skills = [makeSkill({ location: "desktop_skills" })];
    const dests = buildDestinations(skills, ["/a/b", "/c/d"]);
    expect(dests).toHaveLength(4);
    expect(dests.map((d) => d.location)).toEqual(["personal", "desktop_skills", "project", "project"]);
  });
});

describe("encodeDestination", () => {
  it("encodes personal", () => {
    expect(encodeDestination({ label: "", location: "personal", projectPath: null })).toBe("personal:");
  });

  it("encodes desktop_skills", () => {
    expect(encodeDestination({ label: "", location: "desktop_skills", projectPath: null })).toBe("desktop_skills:");
  });

  it("encodes project with path", () => {
    expect(encodeDestination({ label: "", location: "project", projectPath: "/a/b" })).toBe("project:/a/b");
  });
});

describe("decodeDestination", () => {
  it("decodes personal", () => {
    expect(decodeDestination("personal:")).toEqual({ location: "personal", projectPath: null });
  });

  it("decodes desktop_skills", () => {
    expect(decodeDestination("desktop_skills:")).toEqual({ location: "desktop_skills", projectPath: null });
  });

  it("decodes project", () => {
    expect(decodeDestination("project:/a/b")).toEqual({ location: "project", projectPath: "/a/b" });
  });

  it("handles paths with colons", () => {
    expect(decodeDestination("project:C:/Users/test")).toEqual({ location: "project", projectPath: "C:/Users/test" });
  });

  it("roundtrip encode/decode for all types", () => {
    const dests = [
      { label: "A", location: "personal" as const, projectPath: null },
      { label: "B", location: "desktop_skills" as const, projectPath: null },
      { label: "C", location: "project" as const, projectPath: "/x/y/z" },
    ];
    for (const d of dests) {
      const encoded = encodeDestination(d);
      const decoded = decodeDestination(encoded);
      expect(decoded.location).toBe(d.location);
      expect(decoded.projectPath).toBe(d.projectPath);
    }
  });
});
