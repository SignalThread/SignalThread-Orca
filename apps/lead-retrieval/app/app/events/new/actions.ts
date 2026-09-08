"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSessionUser, hasActivePlatformAdminAccountContext, normalizeSessionRole } from "@/lib/auth/session";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { evaluateExhibitorCompanyEventCreationEligibility } from "@/lib/server/exhibitor-company-event-creation-entitlement";
import {
  logExhibitorEventCreationEntitlementAudit,
  shouldAuditExhibitorEventCreation
} from "@/lib/server/exhibitor-event-creation-audit";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { isExhibitorDirectPortfolioEventAccessResolution } from "@/lib/access/event-access-mode";
import { normalizeEventContainerKind } from "@/lib/events/event-container-kind";
import { runCreateEventMutation } from "@/lib/server/events/create-event-mutation";
import {
  eventCreationValidationError,
  type CreateEventMutationError
} from "@/lib/events/create-event-mutation-core";

export type ExhibitorCreateEventState =
  | { ok: true }
  | { ok: false; error: CreateEventMutationError };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeOptionalDate(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return ISO_DATE_RE.test(v) ? v : null;
}

function normalizeOptionalLocation(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function computeStatusForDates(
  startDate: string | null,
  endDate: string | null,
  nowYmd: string
): "ACTIVE" | "UPCOMING" | "COMPLETED" {
  if (startDate && endDate) {
    if (endDate < nowYmd) return "COMPLETED";
    if (startDate > nowYmd) return "UPCOMING";
    return "ACTIVE";
  }
  if (startDate && startDate > nowYmd) return "UPCOMING";
  if (endDate && endDate < nowYmd) return "COMPLETED";
  return "UPCOMING";
}

/**
 * Exhibitor self-serve create-event action.
 *
 * Guardrails:
 *  - Server resolves session user; client role is never trusted.
 *  - Event is scoped to `users.company_id` (canonical company scope).
 *  - License entitlement is evaluated by `runCreateEventMutation` (server-only).
 *  - An `event_users` membership is created idempotently for the creator so the canonical
 *    access resolver picks it up regardless of `event_access_mode`.
 */
export async function createExhibitorEventAction(
  _prev: ExhibitorCreateEventState | null,
  formData: FormData
): Promise<ExhibitorCreateEventState> {
  const name = String(formData.get("name") ?? "").trim();
  const location = normalizeOptionalLocation(String(formData.get("location") ?? ""));
  const timezone = String(formData.get("timezone") ?? "").trim();
  const containerKind = normalizeEventContainerKind(formData.get("containerKind"));
  let startDate = normalizeOptionalDate(String(formData.get("startDate") ?? ""));
  let endDate = normalizeOptionalDate(String(formData.get("endDate") ?? ""));

  if (!name) {
    return { ok: false, error: eventCreationValidationError("Name is required.") };
  }

  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }

  const role = normalizeSessionRole(sessionUser.role);
  const platformAdminAccountContextActive = hasActivePlatformAdminAccountContext(sessionUser);
  if (role !== "exhibitor_admin" && role !== "platform_admin" && role !== "organizer_admin") {
    return {
      ok: false,
      error: { code: "EVENT_CREATION_FORBIDDEN_ROLE", message: "You are not allowed to create events." }
    };
  }

  const companyId = String(sessionUser.company_id ?? "").trim();
  if (!companyId) {
    return {
      ok: false,
      error: {
        code: "EVENT_CREATION_MISSING_COMPANY",
        message: "Your account is not assigned to a company yet."
      }
    };
  }

  let exhibitorAccess: Awaited<ReturnType<typeof getCachedExhibitorAccessibleEventResolution>> | null = null;

  if (role === "exhibitor_admin" || platformAdminAccountContextActive) {
    exhibitorAccess = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
    if (
      !exhibitorAdminMayUseAppEventManagementRoutes({
        role: exhibitorAccess.role,
        resolution: exhibitorAccess.resolution
      })
    ) {
      return {
        ok: false,
        error: {
          code: "EVENT_MANAGEMENT_FORBIDDEN_LICENSE",
          message: "Your license does not include company event management."
        }
      };
    }
  }

  if (containerKind === "continuous_capture") {
    if ((role !== "exhibitor_admin" && !platformAdminAccountContextActive) || !exhibitorAccess) {
      return {
        ok: false,
        error: eventCreationValidationError("Continuous capture events can only be created from the exhibitor workspace.")
      };
    }
    if (!isExhibitorDirectPortfolioEventAccessResolution(exhibitorAccess.resolution)) {
      return {
        ok: false,
        error: eventCreationValidationError("Continuous capture events are only available on company portfolio licenses.")
      };
    }
    startDate = null;
    endDate = null;
  }

  if (startDate && endDate && startDate > endDate) {
    return { ok: false, error: eventCreationValidationError("End date must be on or after start date.") };
  }

  const nowYmd = new Date().toISOString().slice(0, 10);
  const status =
    containerKind === "continuous_capture"
      ? ("ACTIVE" as const)
      : computeStatusForDates(startDate, endDate, nowYmd);

  let auditThisRequest = false;
  let sessionEmail: string | null = null;
  if (role === "exhibitor_admin" && companyId) {
    const supabaseAudit = createAdminClient();
    const { data: userEmailRow } = await (supabaseAudit as any)
      .from("users")
      .select("email")
      .eq("id", sessionUser.id)
      .maybeSingle();
    sessionEmail = String((userEmailRow as { email: string | null } | null)?.email ?? "").trim() || null;
    auditThisRequest = shouldAuditExhibitorEventCreation(sessionEmail);
  }

  const result = await runCreateEventMutation(
    {
      role,
      userId: sessionUser.id,
      companyId: sessionUser.company_id
    },
    {
      companyId,
      name,
      timezone,
      location,
      city: null,
      state: null,
      startDate,
      endDate,
      status,
      containerKind
    },
    auditThisRequest
      ? {
          evaluateExhibitorEntitlement: async (exhibitorCompanyId, opts) => {
            const ent = await evaluateExhibitorCompanyEventCreationEligibility(exhibitorCompanyId, opts);
            await logExhibitorEventCreationEntitlementAudit({
              email: sessionEmail,
              userId: sessionUser.id,
              companyId,
              eligibility: ent
            });
            return ent;
          }
        }
      : undefined
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const supabase = createAdminClient();
  const { data: existingMembership, error: membershipLookupError } = await (supabase as any)
    .from("event_users")
    .select("id")
    .eq("user_id", sessionUser.id)
    .eq("event_id", result.eventId)
    .eq("exhibitor_company_id", companyId)
    .maybeSingle();

  if (membershipLookupError) {
    return {
      ok: false,
      error: {
        code: "EVENT_CREATION_MEMBERSHIP_LOOKUP_FAILED",
        message: membershipLookupError.message ?? "Failed verifying event membership."
      }
    };
  }

  if (!existingMembership) {
    const { error: membershipInsertError } = await (supabase as any).from("event_users").insert({
      user_id: sessionUser.id,
      event_id: result.eventId,
      exhibitor_company_id: companyId,
      status: "active",
      permissions: { admin: true, app: true },
      created_at: new Date().toISOString()
    });
    if (membershipInsertError) {
      return {
        ok: false,
        error: {
          code: "EVENT_CREATION_MEMBERSHIP_INSERT_FAILED",
          message: membershipInsertError.message ?? "Failed creating creator access for the new event."
        }
      };
    }
  }

  redirect(`/app/events/${result.eventId}`);
}
