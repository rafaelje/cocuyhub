import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import type { ClaudeConfig, CommandError, ToolTarget } from "@/types";
import { useAppStore } from "@/stores/useAppStore";
import { McpList } from "./McpList";
import { ProcessWarningBanner } from "./ProcessWarningBanner";
import { CopyConfigButton } from "./CopyConfigButton";

interface ToolTabsProps {
  codeConfig: ClaudeConfig | null;
  desktopConfig: ClaudeConfig | null;
  codeError?: CommandError | null;
  desktopError?: CommandError | null;
  isLoading?: boolean;
}

const tabTriggerClass = cn(
  "px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors -mb-px",
  "data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-white"
);

export function ToolTabs({
  codeConfig,
  desktopConfig,
  codeError,
  desktopError,
  isLoading,
}: ToolTabsProps) {
  const activeTool = useAppStore((s) => s.configActiveTool);
  const setConfigActiveTool = useAppStore((s) => s.setConfigActiveTool);

  return (
    <TabsPrimitive.Root
      value={activeTool}
      onValueChange={(v) => setConfigActiveTool(v as ToolTarget)}
      className="flex flex-col h-full"
    >
      <TabsPrimitive.List
        aria-label="Claude tool selector"
        className="flex border-b border-zinc-800 px-4 shrink-0"
      >
        <TabsPrimitive.Trigger value="code" className={tabTriggerClass}>
          Claude Code
        </TabsPrimitive.Trigger>
        <TabsPrimitive.Trigger value="desktop" className={tabTriggerClass}>
          Claude Desktop
        </TabsPrimitive.Trigger>
      </TabsPrimitive.List>

      <TabsPrimitive.Content value="code" className="flex-1 overflow-hidden flex flex-col">
        <ProcessWarningBanner tool="code" />
        <CopyConfigButton
          source="code"
          destination="desktop"
          hidden={!codeConfig || !desktopConfig}
        />
        <McpList
          config={codeConfig}
          tool="code"
          error={codeError}
          isLoading={isLoading}
        />
      </TabsPrimitive.Content>

      <TabsPrimitive.Content value="desktop" className="flex-1 overflow-hidden flex flex-col">
        <ProcessWarningBanner tool="desktop" />
        <CopyConfigButton
          source="desktop"
          destination="code"
          hidden={!codeConfig || !desktopConfig}
        />
        <McpList
          config={desktopConfig}
          tool="desktop"
          error={desktopError}
          isLoading={isLoading}
        />
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  );
}
