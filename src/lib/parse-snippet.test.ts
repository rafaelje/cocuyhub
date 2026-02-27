import { describe, it, expect } from "vitest";
import { parseSnippet } from "./parse-snippet";

describe("parseSnippet", () => {
  // --- Null cases ---

  it("returns null for non-JSON string", () => {
    expect(parseSnippet("not json at all")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSnippet("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseSnippet("   ")).toBeNull();
  });

  it("returns null for JSON array", () => {
    expect(parseSnippet('["a", "b"]')).toBeNull();
  });

  it("returns null for JSON primitive (string)", () => {
    expect(parseSnippet('"hello"')).toBeNull();
  });

  it("returns null for JSON primitive (number)", () => {
    expect(parseSnippet("42")).toBeNull();
  });

  it("returns null for JSON null", () => {
    expect(parseSnippet("null")).toBeNull();
  });

  it("returns null for object without mcpServers and without server entries", () => {
    expect(parseSnippet('{"foo": "bar"}')).toBeNull();
  });

  it("returns null for empty mcpServers object", () => {
    expect(parseSnippet('{"mcpServers": {}}')).toBeNull();
  });

  it("returns null when mcpServers entry is missing command", () => {
    const snippet = JSON.stringify({
      mcpServers: { "my-server": { args: ["--port", "3000"] } },
    });
    expect(parseSnippet(snippet)).toBeNull();
  });

  it("returns null when direct map entry is missing command", () => {
    const snippet = JSON.stringify({
      "my-server": { args: ["--port", "3000"] },
    });
    expect(parseSnippet(snippet)).toBeNull();
  });

  it("returns null when mcpServers value is not an object", () => {
    const snippet = JSON.stringify({ mcpServers: "not-an-object" });
    expect(parseSnippet(snippet)).toBeNull();
  });

  it("returns null when direct map has mixed valid/invalid entries", () => {
    const snippet = JSON.stringify({
      "valid-server": { command: "node", args: [] },
      "invalid-server": { args: [] }, // no command
    });
    expect(parseSnippet(snippet)).toBeNull();
  });

  // --- Pattern 1: Full mcpServers wrapper ---

  it("parses full mcpServers wrapper with one MCP", () => {
    const snippet = JSON.stringify({
      mcpServers: {
        "my-mcp": { command: "node", args: ["index.js"] },
      },
    });
    const result = parseSnippet(snippet);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]).toEqual({
      name: "my-mcp",
      command: "node",
      args: ["index.js"],
      env: undefined,
    });
  });

  it("parses full mcpServers wrapper with multiple MCPs", () => {
    const snippet = JSON.stringify({
      mcpServers: {
        "server-a": { command: "node", args: [] },
        "server-b": { command: "python", args: ["-m", "server"] },
      },
    });
    const result = parseSnippet(snippet);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.map((m) => m.name)).toEqual(["server-a", "server-b"]);
  });

  // --- Pattern 2: Direct server map (no mcpServers wrapper) ---

  it("parses direct map of server entries (no mcpServers wrapper)", () => {
    const snippet = JSON.stringify({
      "my-server": { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    });
    const result = parseSnippet(snippet);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].name).toBe("my-server");
    expect(result![0].command).toBe("npx");
  });

  // --- Field handling ---

  it("includes env when present", () => {
    const snippet = JSON.stringify({
      mcpServers: {
        "my-mcp": {
          command: "node",
          args: [],
          env: { GITHUB_TOKEN: "abc123", PORT: "3000" },
        },
      },
    });
    const result = parseSnippet(snippet);
    expect(result![0].env).toEqual({ GITHUB_TOKEN: "abc123", PORT: "3000" });
  });

  it("env is undefined when not present in snippet", () => {
    const snippet = JSON.stringify({
      mcpServers: { "my-mcp": { command: "node", args: [] } },
    });
    const result = parseSnippet(snippet);
    expect(result![0].env).toBeUndefined();
  });

  it("uses empty array for args when args field is absent", () => {
    const snippet = JSON.stringify({
      mcpServers: { "my-mcp": { command: "node" } },
    });
    const result = parseSnippet(snippet);
    expect(result![0].args).toEqual([]);
  });

  it("uses empty array for args when args is explicitly empty", () => {
    const snippet = JSON.stringify({
      mcpServers: { "my-mcp": { command: "node", args: [] } },
    });
    const result = parseSnippet(snippet);
    expect(result![0].args).toEqual([]);
  });

  it("filters non-string elements from args array", () => {
    const snippet = JSON.stringify({
      mcpServers: {
        "my-mcp": { command: "node", args: ["--port", 3000, null, "index.js"] },
      },
    });
    const result = parseSnippet(snippet);
    expect(result![0].args).toEqual(["--port", "index.js"]);
  });

  it("does not count errors (severity 8) as warnings — parseSnippet returns null for non-parseable", () => {
    // Ensure invalid JSON returns null (not throws)
    expect(parseSnippet("{invalid json")).toBeNull();
  });

  it("handles MCP with only command field (minimal valid entry)", () => {
    const snippet = JSON.stringify({
      mcpServers: { "minimal-mcp": { command: "echo" } },
    });
    const result = parseSnippet(snippet);
    expect(result).not.toBeNull();
    expect(result![0]).toEqual({
      name: "minimal-mcp",
      command: "echo",
      args: [],
      env: undefined,
    });
  });

  it("preserves name as the mcpServers key", () => {
    const snippet = JSON.stringify({
      mcpServers: {
        "github-mcp-server": { command: "node", args: [] },
      },
    });
    const result = parseSnippet(snippet);
    expect(result![0].name).toBe("github-mcp-server");
  });

  it("ignores extra fields on mcpServers object (e.g., top-level keys besides mcpServers)", () => {
    const snippet = JSON.stringify({
      mcpServers: { "my-mcp": { command: "node", args: [] } },
      otherTopLevelField: true,
    });
    // Has mcpServers → uses pattern 1, should succeed
    const result = parseSnippet(snippet);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
  });
});
