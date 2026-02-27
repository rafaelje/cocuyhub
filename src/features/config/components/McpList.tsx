import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { invokeCommand } from "@/lib/ipc";
import { useConfigStore } from "@/stores/useConfigStore";
import type { ClaudeConfig, CommandError, ToolTarget } from "@/types";
import { MCPRow } from "./MCPRow";

interface McpListProps {
  config: ClaudeConfig | null;
  tool: ToolTarget;
  error?: CommandError | null;
  isLoading?: boolean;
}

export function McpList({ config, tool, error, isLoading }: McpListProps) {
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

  const entries = config ? Object.entries(config.mcpServers) : [];

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-zinc-500 text-center py-8">
          No MCPs configured. Paste a config to add one.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      {entries.map(([name, mcpConfig]) => (
        <MCPRow
          key={name}
          name={name}
          config={mcpConfig}
          tool={tool}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      ))}
    </ScrollArea>
  );
}
