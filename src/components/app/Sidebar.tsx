import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Settings2, Code2, User, History, SlidersHorizontal, type LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import { MixedDiffBanner } from "@/features/profiles/components/MixedDiffBanner";

interface NavItemConfig {
  path: string;
  label: string;
  icon: LucideIcon;
  shortcutNum: number;
}

const NAV_ITEMS: NavItemConfig[] = [
  { path: "/config",    label: "Config",    icon: Settings2,         shortcutNum: 1 },
  { path: "/editor",   label: "Editor",    icon: Code2,             shortcutNum: 2 },
  { path: "/profiles", label: "Profiles",  icon: User,              shortcutNum: 3 },
  { path: "/snapshots",label: "Snapshots", icon: History,           shortcutNum: 4 },
  { path: "/settings", label: "Settings",  icon: SlidersHorizontal, shortcutNum: 5 },
];

interface NavItemProps {
  item: NavItemConfig;
  collapsed: boolean;
}

function NavItem({ item, collapsed }: NavItemProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const Icon = item.icon;

  const isActive =
    location.pathname === item.path ||
    location.pathname.startsWith(item.path + "/");

  const buttonClassName = cn(
    "flex items-center gap-3 px-3 h-10 w-full text-sm transition-colors",
    isActive
      ? "bg-zinc-800 border-l-2 border-emerald-500 text-zinc-50"
      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
  );

  const button = (
    <button
      className={buttonClassName}
      onClick={() => navigate(item.path)}
      aria-label={item.label}
    >
      <Icon size={16} className="shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">
          <p>{item.label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useAppStore();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 900) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [setSidebarCollapsed]);

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "flex flex-col bg-zinc-900 border-r border-zinc-800 transition-all duration-200",
          sidebarCollapsed ? "w-12" : "w-60"
        )}
      >
        <div className="h-12 flex items-center px-3 border-b border-zinc-800">
          {/* placeholder for ProfileSwitcher in Epic 4 */}
        </div>

        {!sidebarCollapsed && <MixedDiffBanner />}

        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.path} item={item} collapsed={sidebarCollapsed} />
          ))}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
