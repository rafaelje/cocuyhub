// Mirrors src-tauri/src/models.rs — keep in sync manually

export type ToolTarget = "code" | "desktop";

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  _description?: string;
}

export interface ProjectConfig {
  mcpServers: Record<string, McpServerConfig>;
  disabledMcps?: Record<string, McpServerConfig>;
}

export interface ClaudeConfig {
  mcpServers: Record<string, McpServerConfig>;
  disabledMcps?: Record<string, McpServerConfig>;
  projects?: Record<string, ProjectConfig>;
}

export interface Profile {
  id: string;
  name: string;
  mcpServers: { code: Record<string, McpServerConfig>; desktop: Record<string, McpServerConfig> };
  createdAt: string;
}

export interface Snapshot {
  id: string;
  name: string;
  timestamp: string; // ISO 8601
  tool: ToolTarget;
  content: string;
  isAuto: boolean;
}

export interface CommandError {
  type: "FileNotFound" | "ParseError" | "ReadError" | "WriteError" | "SnapshotError" | "ProcessError";
  path?: string;    // FileNotFound
  message?: string; // ParseError, ReadError, WriteError, etc.
}

export interface AppSettings {
  codePath: string | null;
  desktopPath: string | null;
}

export interface DetectedPaths {
  codePath: string | null;
  desktopPath: string | null;
}

export interface ParsedMcp {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  entriesCount: number;
}

export interface PlanLimits {
  messageLimit: number;
  tokenLimit: number;
  costLimitUsd: number;
}

export interface SessionBlock {
  startTime: string;
  endTime: string;
  isActive: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  messageCount: number;
  modelStats: Record<string, ModelStats>;
  limitReached: boolean;
}

export type SkillLocation = "personal" | "project" | "desktop_skills" | "desktop_examples";

export interface SkillTreeNode {
  name: string;
  path: string;
  nodeType: "file" | "dir";
  children: SkillTreeNode[];
}

export interface SkillInfo {
  name: string;
  slug: string;
  description: string | null;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  allowedTools: string | null;
  argumentHint: string | null;
  location: SkillLocation;
  projectPath: string | null;
  bodyPreview: string | null;
  disabled: boolean;
}

export interface MetricsPayload {
  activeSession: SessionBlock | null;
  pastSessions: SessionBlock[];
  globalModelStats: Record<string, ModelStats>;
  projectsPath: string;
  detectedPlan: "pro" | "max5" | "max20" | "custom";
  planConfidence: "confirmed" | "inferred" | "unknown";
  planLimits: PlanLimits;
}
