export type PlatformNavigationSection = "accounts" | "users";

/** Returns the one Platform Admin section that owns a pathname. */
export function activePlatformNavigationSection(pathname: string): PlatformNavigationSection | null {
  if (pathname === "/platform/accounts" || pathname.startsWith("/platform/accounts/")) {
    return "accounts";
  }
  if (pathname === "/platform/users" || pathname.startsWith("/platform/users/")) {
    return "users";
  }
  return null;
}
