import {
  AlertTriangle,
  Armchair,
  ClipboardList,
  Mic,
  Monitor,
  Rows3,
  UsersRound,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { isSessionModuleAvailable } from "@/config/features";
import type { Matrix2SessionAction } from "./types";

export type Matrix2QuickPanelKey = "speakers" | "av" | "fnb" | "staffing";
export type Matrix2QuickModuleDestination = "drawer" | "workspace";
export type Matrix2QuickModuleLauncherVariant = "module" | "workflow-link";

export type Matrix2QuickModule = Readonly<{
  action: Exclude<Matrix2SessionAction, "workspace">;
  label: string;
  icon: LucideIcon;
  destination: Matrix2QuickModuleDestination;
  quickPanel: Matrix2QuickPanelKey | null;
  enabled: boolean;
  launcherVariant?: Matrix2QuickModuleLauncherVariant;
  launcherTooltip?: string;
}>;

const MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED = isSessionModuleAvailable("room-set");

export const MATRIX2_QUICK_MODULES: readonly Matrix2QuickModule[] = [
  {
    action: "basics",
    label: "Details",
    icon: ClipboardList,
    destination: "drawer",
    quickPanel: null,
    enabled: true,
  },
  {
    action: "speakers",
    label: "Speakers",
    icon: Mic,
    destination: "drawer",
    quickPanel: "speakers",
    enabled: true,
  },
  {
    action: "av",
    label: "AV",
    icon: Monitor,
    destination: "drawer",
    quickPanel: "av",
    enabled: true,
  },
  {
    action: "fnb",
    label: "F&B",
    icon: UtensilsCrossed,
    destination: "drawer",
    quickPanel: "fnb",
    enabled: true,
  },
  {
    action: "staffing",
    label: "Staffing",
    icon: UsersRound,
    destination: "drawer",
    quickPanel: "staffing",
    enabled: true,
  },
  {
    action: "conflicts",
    label: "Conflicts",
    icon: AlertTriangle,
    destination: "workspace",
    quickPanel: null,
    enabled: true,
  },
  {
    action: "room-set",
    label: "Room Set",
    icon: Armchair,
    destination: "workspace",
    quickPanel: null,
    enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED,
    launcherVariant: "workflow-link",
    launcherTooltip: "Open layout workspace",
  },
  {
    action: "seating",
    label: "Seating",
    icon: Rows3,
    destination: "workspace",
    quickPanel: null,
    enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED,
    launcherVariant: "workflow-link",
    launcherTooltip: "Open seating workspace",
  },
] as const;

export const MATRIX2_QUICK_DRAWER_MODULES = MATRIX2_QUICK_MODULES.filter(
  // Details is rendered once as the explicit null-panel entry in the drawer
  // switcher; this collection is only for named quick panels.
  (module) => module.destination === "drawer" && module.quickPanel !== null,
);

export function matrix2QuickModule(action: Matrix2SessionAction): Matrix2QuickModule | null {
  if (action === "workspace") return null;
  return MATRIX2_QUICK_MODULES.find((module) => module.action === action) ?? null;
}
