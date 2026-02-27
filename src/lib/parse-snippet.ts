import type { ParsedMcp } from "@/types";

/**
 * Parse a raw string snippet into an array of ParsedMcp entries.
 * Returns null if the string cannot be interpreted as an MCP config.
 *
 * Supported snippet shapes:
 *   1. Full mcpServers wrapper: { "mcpServers": { "name": { command, args, env } } }
 *   2. Direct map of server entries: { "name": { command, args, env }, ... }
 *
 * Shape 3 (single server entry without a key) is NOT supported — the name
 * cannot be extracted. Returns null in that case.
 */
export function parseSnippet(raw: string): ParsedMcp[] | null {
  if (!raw || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Pattern 1: Full mcpServers wrapper
  if (
    "mcpServers" in obj &&
    typeof obj.mcpServers === "object" &&
    obj.mcpServers !== null &&
    !Array.isArray(obj.mcpServers)
  ) {
    return extractMcpsFromMap(obj.mcpServers as Record<string, unknown>);
  }

  // Pattern 2: Direct map of server entries — every value must have a "command" field
  const entries = Object.entries(obj);
  if (entries.length > 0 && entries.every(([, v]) => isServerEntry(v))) {
    return extractMcpsFromMap(obj);
  }

  return null;
}

function isServerEntry(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as Record<string, unknown>).command === "string"
  );
}

function extractMcpsFromMap(map: Record<string, unknown>): ParsedMcp[] | null {
  const results: ParsedMcp[] = [];

  for (const [name, entry] of Object.entries(map)) {
    if (!isServerEntry(entry)) return null;

    const e = entry as Record<string, unknown>;
    const args: string[] = Array.isArray(e.args)
      ? (e.args as unknown[]).filter((a): a is string => typeof a === "string")
      : [];

    let env: Record<string, string> | undefined;
    if (
      typeof e.env === "object" &&
      e.env !== null &&
      !Array.isArray(e.env)
    ) {
      env = e.env as Record<string, string>;
    }

    results.push({ name, command: e.command as string, args, env });
  }

  return results.length > 0 ? results : null;
}
