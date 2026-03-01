import type { SkillInfo, SkillLocation } from "@/types";

export interface CopyDestination {
  label: string;
  location: SkillLocation;
  projectPath: string | null;
}

export function buildDestinations(skills: SkillInfo[], projectPaths: string[]): CopyDestination[] {
  const dests: CopyDestination[] = [
    { label: "Claude Code Skills", location: "personal", projectPath: null },
  ];
  if (skills.some((s) => s.location === "desktop_skills")) {
    dests.push({ label: "Claude Desktop Skills", location: "desktop_skills", projectPath: null });
  }
  for (const pp of projectPaths) {
    const short = pp.split("/").slice(-2).join("/");
    dests.push({ label: `Project: ${short}`, location: "project", projectPath: pp });
  }
  return dests;
}

export function encodeDestination(d: CopyDestination): string {
  return d.location === "project" ? `project:${d.projectPath}` : `${d.location}:`;
}

export function decodeDestination(val: string): { location: string; projectPath: string | null } {
  const [loc, ...rest] = val.split(":");
  const pp = rest.join(":");
  return loc === "project" ? { location: "project", projectPath: pp || null } : { location: loc, projectPath: null };
}
