import { useState } from "react";
import type { ClaudeConfig, CommandError } from "@/types";
import { McpList } from "./McpList";
import { ProjectsSection } from "./ProjectsSection";

interface CodeConfigPanelProps {
  codeConfig: ClaudeConfig | null;
  desktopConfig: ClaudeConfig | null;
  codeError: CommandError | null | undefined;
  isLoading: boolean | undefined;
}

export function CodeConfigPanel({ codeConfig, desktopConfig, codeError, isLoading }: CodeConfigPanelProps) {
  const [globalExpanded, setGlobalExpanded] = useState(true);

  const globalMcpCount =
    Object.keys(codeConfig?.mcpServers ?? {}).length +
    Object.keys(codeConfig?.disabledMcps ?? {}).length;

  const hasProjects =
    codeConfig?.projects != null && Object.keys(codeConfig.projects).length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Global Section header — always sticky */}
      <div className="shrink-0 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <button
          onClick={() => setGlobalExpanded((prev) => !prev)}
          className="flex items-center gap-2 w-full text-left"
          aria-expanded={globalExpanded}
          aria-label="Toggle Global section"
        >
          <span className="text-zinc-400 text-xs">{globalExpanded ? "▼" : "▶"}</span>
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex-1">
            Global
          </span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
            {globalMcpCount > 0 ? `${globalMcpCount} MCP` : "Empty"}
          </span>
        </button>
      </div>

      {/* Single scrollable area for global content + projects */}
      <div className="flex-1 overflow-y-auto">
        {globalExpanded && (
          <McpList
            config={codeConfig}
            tool="code"
            otherConfig={desktopConfig}
            error={codeError}
            isLoading={isLoading}
            noScroll
          />
        )}
        {hasProjects && (
          <ProjectsSection
            projects={codeConfig?.projects}
            desktopConfig={desktopConfig}
          />
        )}
      </div>
    </div>
  );
}
