import { useConfigStore } from "@/stores/useConfigStore";
import { ToolTabs } from "./ToolTabs";
import { SmartPasteBanner } from "./SmartPasteBanner";

export function ConfigView() {
  const { codeConfig, desktopConfig, codeError, desktopError, isLoading } =
    useConfigStore();

  return (
    <div className="flex flex-col h-full">
      <SmartPasteBanner />
      <ToolTabs
        codeConfig={codeConfig}
        desktopConfig={desktopConfig}
        codeError={codeError}
        desktopError={desktopError}
        isLoading={isLoading}
      />
    </div>
  );
}
