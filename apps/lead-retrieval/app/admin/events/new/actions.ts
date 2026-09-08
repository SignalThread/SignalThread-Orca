"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSessionUser, normalizeSessionRole } from "@/lib/auth/session";
import { adminRouteDebugLog } from "@/lib/data/admin-events";
import { runCreateEventMutation } from "@/lib/server/events/create-event-mutation";
import {
  eventCreationNoAssigneeCompanyError,
  eventCreationValidationError,
  type CreateEventMutationError
} from "@/lib/events/create-event-mutation-core";

export type AdminCreateEventState =
  | { ok: true }
  | { ok: false; error: CreateEventMutationError };

function splitLocation(location: string) {
  const value = location.trim();
  if (!value) {
    return { city: null, state: null };
  }

  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { city: null, state: null };
  }

  if (parts.length === 1) {
    return { city: parts[0], state: null };
  }

  const state = parts.pop() ?? null;
  const city = parts.join(", ");
  return {
    city: city || null,
    state: state || null
  };
}

async function resolveEventCompanyId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sessionCompanyId: string | null
) {
  if (sessionCompanyId) {
    return sessionCompanyId;
  }

  const { data: existingEventCompany } = await (supabase as any)
    .from("events")
    .select("company_id")
    .not("company_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingEventCompany?.company_id) {
    return existingEventCompany.company_id as string;
  }

  const { data: fallbackCompany } = await (supabase as any)
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackCompany?.id) {
    return fallbackCompany.id as string;
  }

  return null;
}

export async function createAdminEventAction(
  _prev: AdminCreateEventState | null,
  formData: FormData
): Promise<AdminCreateEventState> {
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const status = String(formData.get("status") ?? "UPCOMING").trim().toUpperCase();
  const location = String(formData.get("location") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();

  if (!name || !startDate || !endDate || !status || !timezone) {
    return {
      ok: false,
      error: eventCreationValidationError("Please complete all required fields.")
    };
  }

  if (!["ACTIVE", "UPCOMING", "COMPLETED"].includes(status)) {
    return {
      ok: false,
      error: eventCreationValidationError("Invalid status selected.")
    };
  }

  if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
    return {
      ok: false,
      error: eventCreationValidationError("End date must be after start date.")
    };
  }

  const supabase = await createSupabaseServerClient();
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    redirect("/login");
  }

  const eventCompanyId = await resolveEventCompanyId(supabase, sessionUser.company_id);

  if (!eventCompanyId) {
    return { ok: false, error: eventCreationNoAssigneeCompanyError() };
  }

  const { city, state } = splitLocation(location);

  adminRouteDebugLog("events.create.submit", {
    name,
    startDate,
    endDate,
    status,
    companyId: eventCompanyId,
    city,
    state
  });

  const createResult = await runCreateEventMutation(
    {
      role: normalizeSessionRole(sessionUser.role),
      userId: sessionUser.id,
      companyId: sessionUser.company_id
    },
    {
      companyId: eventCompanyId,
      name,
      timezone,
      location: location || null,
      city,
      state,
      startDate,
      endDate,
      status: status as "ACTIVE" | "UPCOMING" | "COMPLETED"
    }
  );

  if (!createResult.ok) {
    return { ok: false, error: createResult.error };
  }

  adminRouteDebugLog("events.create.success", {
    eventId: createResult.eventId
  });

  redirect(`/admin/events/${createResult.eventId}`);
}
