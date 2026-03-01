// import { useCallback, useRef } from "react";
// import { useProfileSwitcherShortcut } from "@/hooks/useKeyboardShortcuts";
// import {
//   ProfileSwitcher,
//   type ProfileSwitcherHandle,
// } from "@/features/profiles/components/ProfileSwitcher";
import { HealthIndicator } from "./HealthIndicator";

export function Header() {
  // const switcherRef = useRef<ProfileSwitcherHandle>(null);
  // const handleOpen = useCallback(() => switcherRef.current?.open(), []);
  // useProfileSwitcherShortcut(handleOpen);

  return (
    <header
      data-tauri-drag-region
      className="h-12 flex items-center gap-2 pl-20 pr-4 bg-zinc-900 border-b border-zinc-800 shrink-0"
    >
      <span className="text-sm font-medium text-zinc-400 select-none">
        CocuyHub
      </span>
      <div className="flex-1" />
      {/* <ProfileSwitcher ref={switcherRef} /> */}
      <HealthIndicator />
    </header>
  );
}
