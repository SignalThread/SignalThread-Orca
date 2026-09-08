/**
 * Exhibitor post-login web home (static paths only, safe to import on client and server).
 *
 * - {@link EXHIBITOR_WEB_ENTRY_RESOLVER_PATH} — central redirect that picks dashboard vs
 *   "mobile only" success vs leads based on `event_users` permissions;
 *   {@link EXHIBITOR_APP_ACCESS_READY_HREF} — app entitlements, no web admin.
 */
export const EXHIBITOR_WEB_ENTRY_RESOLVER_PATH = "/api/auth/exhibitor-web-entry" as const;

export const EXHIBITOR_APP_ACCESS_READY_HREF = "/exhibitor/app-access-ready" as const;
