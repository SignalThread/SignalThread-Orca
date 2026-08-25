export const PLATFORM_USER_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type PlatformUserRole = (typeof PLATFORM_USER_ROLES)[number];
export const EVENT_ACCESS_ROLES = ["EVENT_ADMIN", "EVENT_EDITOR", "EVENT_VIEWER"] as const;
export type EventAccessRole = (typeof EVENT_ACCESS_ROLES)[number];

const labels: Record<PlatformUserRole | EventAccessRole, string> = {
  SUPER_ADMIN: "Super admin",
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
  EVENT_ADMIN: "Event admin",
  EVENT_EDITOR: "Event editor",
  EVENT_VIEWER: "Event viewer",
};

export function platformRoleLabel(role: PlatformUserRole): string {
  return labels[role];
}

export function eventAccessRoleLabel(role: EventAccessRole): string {
  return labels[role];
}
