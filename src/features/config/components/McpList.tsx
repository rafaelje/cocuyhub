import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import type { ClaudeConfig, CommandError, McpServerConfig, ToolTarget } from "@/types";
import { MCPRow } from "./MCPRow";

interface McpListProps {
  config: ClaudeConfig | null;
  tool: ToolTarget;
  otherConfig?: ClaudeConfig | null;
  error?: CommandError | null;
  isLoading?: boolean;
  noScroll?: boolean;
}

export function McpList({ config, tool, otherConfig, error, isLoading, noScroll }: McpListProps) {
  const otherTool: ToolTarget = tool === "code" ? "desktop" : "code";

  const handleCopyToOther = async (name: string, mcpConfig: McpServerConfig): Promise<void> => {
    try {
      await invokeCommand("mcp_add_from_snippet", {
        name,
        command: mcpConfig.command,
        args: mcpConfig.args,
        env: mcpConfig.env,
        tool: otherTool,
      });
      await useConfigStore.getState().reloadConfig(otherTool);
      const otherLabel = otherTool === "code" ? "Code" : "Desktop";
      toast.success(`${name} copied to Claude ${otherLabel}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to copy MCP: ${msg}`, { duration: Infinity });
    }
  };

  const handleDelete = async (name: string): Promise<void> => {
    try {
      await invokeCommand("mcp_delete", { name, tool });
      await useConfigStore.getState().reloadConfig(tool);
      toast.success(`MCP ${name} removed`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to delete MCP: ${msg}`, { duration: Infinity });
      // Do NOT re-throw — no optimistic state to roll back in MCPRow for deletion
    }
  };

  const handleRename = async (oldName: string, newName: string): Promise<void> => {
    try {
      await invokeCommand("mcp_rename", { oldName, newName, tool });
      await useConfigStore.getState().reloadConfig(tool);
      toast.success(`MCP ${oldName} renamed to ${newName}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to rename MCP: ${msg}`, { duration: Infinity });
      throw err; // Re-throw so MCPRow keeps editing open for retry (consistent with handleToggle)
    }
  };

  const handleDescriptionChange = async (name: string, description: string | null): Promise<void> => {
    try {
      await invokeCommand("mcp_set_description", { name, description, tool });
      await useConfigStore.getState().reloadConfig(tool);
      toast.success(`Description updated for ${name}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to update description: ${msg}`, { duration: Infinity });
      throw err; // Re-throw so MCPRow keeps editing open for retry
    }
  };

  const handleToggle = async (name: string, enabled: boolean): Promise<void> => {
    try {
      await invokeCommand("mcp_toggle", { name, enabled, tool });
      await useConfigStore.getState().reloadConfig(tool);
      toast.success(`MCP ${name} ${enabled ? "enabled" : "disabled"}`, { duration: 3000 });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Unknown error";
      toast.error(`Failed to toggle MCP: ${msg}`, { duration: Infinity });
      throw err; // Re-throw so MCPRow can rollback optimistic state
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-zinc-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-red-400 text-center py-8">
          Could not read config file. Check the path in Settings.
        </p>
      </div>
    );
  }

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

  const isEmpty = allEntries.length === 0;

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-zinc-500 text-center py-8">
          No MCPs configured. Paste a config to add one.
        </p>
      </div>
    );
  }

  const rows = allEntries.map(({ name, mcpConfig, enabled }) => (
    <MCPRow
      key={name}
      name={name}
      config={mcpConfig}
      tool={tool}
      enabled={enabled}
      onToggle={handleToggle}
      onDelete={handleDelete}
      onCopyToOther={otherConfig != null ? handleCopyToOther : undefined}
      onRename={handleRename}
      existingNames={allEntries.map((e) => e.name)}
      onDescriptionChange={handleDescriptionChange}
    />
  ));

  if (noScroll) {
    return <div>{rows}</div>;
  }

  return <ScrollArea className="h-full">{rows}</ScrollArea>;
}
