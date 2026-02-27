import { toast } from "sonner";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import type { ClaudeConfig, McpServerConfig, ProjectConfig } from "@/types";
import { MCPRow } from "./MCPRow";

interface ProjectMcpListProps {
  config: ProjectConfig | null | undefined;
  projectPath: string;
  desktopConfig: ClaudeConfig | null;
}

export function ProjectMcpList({ config, projectPath, desktopConfig }: ProjectMcpListProps) {
  const handleToggle = async (name: string, enabled: boolean): Promise<void> => {
    try {
      await invokeCommand("project_mcp_toggle", { name, enabled, projectPath });
      await useConfigStore.getState().reloadConfig("code");
      toast.success(`MCP ${name} ${enabled ? "enabled" : "disabled"}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to toggle MCP: ${msg}`, { duration: Infinity });
      throw err;
    }
  };

  const handleDelete = async (name: string): Promise<void> => {
    try {
      await invokeCommand("project_mcp_delete", { name, projectPath });
      await useConfigStore.getState().reloadConfig("code");
      toast.success(`MCP ${name} removed`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to delete MCP: ${msg}`, { duration: Infinity });
    }
  };

  const handleRename = async (oldName: string, newName: string): Promise<void> => {
    try {
      await invokeCommand("project_mcp_rename", { oldName, newName, projectPath });
      await useConfigStore.getState().reloadConfig("code");
      toast.success(`MCP ${oldName} renamed to ${newName}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to rename MCP: ${msg}`, { duration: Infinity });
      throw err;
    }
  };

  const handleDescriptionChange = async (name: string, description: string | null): Promise<void> => {
    try {
      await invokeCommand("project_mcp_set_description", { name, description, projectPath });
      await useConfigStore.getState().reloadConfig("code");
      toast.success(`Description updated for ${name}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to update description: ${msg}`, { duration: Infinity });
      throw err;
    }
  };

  const handleCopyToGlobal = async (name: string, mcpConfig: McpServerConfig): Promise<void> => {
    try {
      await invokeCommand("mcp_add_from_snippet", {
        name,
        command: mcpConfig.command,
        args: mcpConfig.args,
        env: mcpConfig.env,
        tool: "code",
      });
      await useConfigStore.getState().reloadConfig("code");
      toast.success(`${name} copied to Global`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to copy MCP: ${msg}`, { duration: Infinity });
    }
  };

  const handleCopyToDesktop = async (name: string, mcpConfig: McpServerConfig): Promise<void> => {
    try {
      await invokeCommand("mcp_add_from_snippet", {
        name,
        command: mcpConfig.command,
        args: mcpConfig.args,
        env: mcpConfig.env,
        tool: "desktop",
      });
      await useConfigStore.getState().reloadConfig("desktop");
      toast.success(`${name} copied to Claude Desktop`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to copy MCP: ${msg}`, { duration: Infinity });
    }
  };

  const seenNames = new Set<string>();
  const allEntries = [
    ...Object.entries(config?.mcpServers ?? {}).map(([name, mcpConfig]) => ({ name, mcpConfig, enabled: true })),
    ...Object.entries(config?.disabledMcps ?? {}).map(([name, mcpConfig]) => ({ name, mcpConfig, enabled: false })),
  ]
    .filter(({ name }) => {
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  if (allEntries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-zinc-500 text-center py-8">
          No MCPs configured. Paste a config to add one.
        </p>
      </div>
    );
  }

  return (
    <div>
      {allEntries.map(({ name, mcpConfig, enabled }) => (
        <MCPRow
          key={name}
          name={name}
          config={mcpConfig}
          tool="code"
          enabled={enabled}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onCopyToGlobal={handleCopyToGlobal}
          onCopyToDesktop={desktopConfig != null ? handleCopyToDesktop : undefined}
          onRename={handleRename}
          existingNames={allEntries.map((e) => e.name)}
          onDescriptionChange={handleDescriptionChange}
        />
      ))}
    </div>
  );
}
