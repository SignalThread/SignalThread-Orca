/**
 * Canonical helpers for "exhibitor-side" role scope checks.
 *
 * - `isExhibitorScopedRole`    — true for any role that may view exhibitor-side
 *                                read surfaces (dashboard / leads). Currently
 *                                `exhibitor_admin` and `exhibitor_viewer`.
 * - `isExhibitorAdminRole`     — true ONLY for the full exhibitor admin role
 *                                (`exhibitor_admin`). Use to gate write/admin
 *                                affordances (create/edit/delete/import/export,
 *                                user/license/settings/campaign management).
 * - `isExhibitorViewerRole`    — true ONLY for the limited view-only
 *                                `exhibitor_viewer` role.
 *
 * These are intentionally narrow, pure functions that accept any string-ish
 * input so they can be called both with `AppRole | null` from a session and
 * with raw DB strings when working below the session layer. They never
 * normalize or coerce — pass already-normalized values when it matters.
 */
import type { AppRole } from "@/types/app";

type RoleLike = AppRole | string | null | undefined;

export function isExhibitorViewerRole(role: RoleLike): boolean {
  return role === "exhibitor_viewer";
}

export function isExhibitorAdminRole(role: RoleLike): boolean {
  return role === "exhibitor_admin";
}

export function isExhibitorScopedRole(role: RoleLike): boolean {
  return role === "exhibitor_admin" || role === "exhibitor_viewer";
}
