import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { canMutateExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import { getValidGoogleAccessTokenForUser } from "@/lib/integrations/google/token-manager";
import {
  createGooglePrivateCalendarEvent,
  deleteGooglePrivateCalendarEvent,
  updateGooglePrivateCalendarEvent,
  type GoogleCalendarFailure
} from "@/lib/integrations/google/calendar-client";
import {
  deterministicFollowUpReminderId,
  normalizeFollowUpCommand,
  type FollowUpCalendarResult,
  type FollowUpCommand,
  type FollowUpProvider,
  type FollowUpResult,
  type NormalizedFollowUpCommand
} from "@/lib/follow-ups/lead-follow-up-core";

export type FollowUpLeadRow = {
  id: string;
  company_id: string;
  event_id: string | null;
  full_name: string;
  follow_up_at: string | null;
  follow_up_date: string | null;
  follow_up_note: string | null;
  follow_up_completed_at: string | null;
  follow_up_calendar_event_id: string | null;
  follow_up_calendar_provider: FollowUpProvider | null;
  follow_up_calendar_owner_user_id: string | null;
  follow_up_last_operation_key: string | null;
  follow_up_last_operation_fingerprint: string | null;
  follow_up_last_operation_result: unknown;
  updated_at: string;
};

type FollowUpPatch = Partial<Pick<
  FollowUpLeadRow,
  | "follow_up_at"
  | "follow_up_date"
  | "follow_up_note"
  | "follow_up_completed_at"
  | "follow_up_calendar_event_id"
  | "follow_up_calendar_provider"
  | "follow_up_calendar_owner_user_id"
>>;

export type FollowUpRepository = {
  load(input: { companyId: string; leadId: string }): Promise<FollowUpLeadRow | null>;
  claim(input: {
    companyId: string;
    leadId: string;
    expectedUpdatedAt: string;
    command: NormalizedFollowUpCommand;
    patch: FollowUpPatch;
  }): Promise<FollowUpLeadRow | null>;
  finalize(input: {
    companyId: string;
    leadId: string;
    idempotencyKey: string;
    patch: FollowUpPatch;
    result: FollowUpResult;
  }): Promise<FollowUpLeadRow | null>;
};

type ReminderOperation = "create" | "update" | "delete";
type ReminderGatewayResult =
  | { ok: true; eventId: string | null }
  | { ok: false; errorCategory: string };

export type FollowUpReminderGateway = {
  sync(input: {
    provider: FollowUpProvider;
    operation: ReminderOperation;
    userId: string;
    companyId: string;
    eventId: string;
    startsAt: string | null;
    timezone: string | null;
    title: string;
  }): Promise<ReminderGatewayResult>;
};

export type FollowUpServiceDependencies = {
  repository: FollowUpRepository;
  reminderGateway: FollowUpReminderGateway;
  authorize(input: {
    userId: string;
    companyId: string;
    role: string;
    isBearer: boolean;
    leadEventId: string | null;
  }): Promise<boolean>;
  now(): Date;
};

export type ManageLeadFollowUpInput = {
  userId: string;
  companyId: string;
  role: string;
  isBearer: boolean;
  leadId: string;
  command: FollowUpCommand;
};

export type ManageLeadFollowUpResponse =
  | FollowUpResult
  | {
      ok: false;
      outcome: "invalid_input" | "not_found" | "unauthorized" | "conflict";
      error: string;
    };

const FOLLOW_UP_COLUMNS = [
  "id",
  "company_id",
  "event_id",
  "full_name",
  "follow_up_at",
  "follow_up_date",
  "follow_up_note",
  "follow_up_completed_at",
  "follow_up_calendar_event_id",
  "follow_up_calendar_provider",
  "follow_up_calendar_owner_user_id",
  "follow_up_last_operation_key",
  "follow_up_last_operation_fingerprint",
  "follow_up_last_operation_result",
  "updated_at"
].join(", ");

function outcomeForAction(action: NormalizedFollowUpCommand["action"]): FollowUpResult["outcome"] {
  return action === "save" ? "saved" : action === "complete" ? "completed" : "cleared";
}

function storedResult(value: unknown): FollowUpResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FollowUpResult>;
  if (candidate.ok !== true || typeof candidate.partialSuccess !== "boolean") return null;
  if (!candidate.followUp || !candidate.calendar) return null;
  return candidate as FollowUpResult;
}

function semanticPatch(command: NormalizedFollowUpCommand, now: Date): FollowUpPatch {
  if (command.action === "save") {
    return {
      follow_up_at: command.followUpAt,
      follow_up_date: command.followUpDate,
      follow_up_note: command.note,
      follow_up_completed_at: null
    };
  }
  if (command.action === "complete") {
    return { follow_up_completed_at: now.toISOString() };
  }
  return {
    follow_up_at: null,
    follow_up_date: null,
    follow_up_note: null,
    follow_up_completed_at: null
  };
}

function calendarPlan(input: {
  command: NormalizedFollowUpCommand;
  lead: FollowUpLeadRow;
  userId: string;
  companyId: string;
}) {
  const hasReference = Boolean(input.lead.follow_up_calendar_event_id);
  const ownedReference =
    hasReference &&
    input.lead.follow_up_calendar_provider === "google_workspace" &&
    input.lead.follow_up_calendar_owner_user_id === input.userId;

  if (hasReference && !ownedReference) {
    return { operation: "ownership_mismatch" as const, eventId: null };
  }
  if (input.command.action !== "save") {
    return ownedReference
      ? { operation: "delete" as const, eventId: input.lead.follow_up_calendar_event_id! }
      : { operation: null, eventId: null };
  }
  if (input.command.reminderEnabled === false) {
    return ownedReference
      ? { operation: "delete" as const, eventId: input.lead.follow_up_calendar_event_id! }
      : { operation: null, eventId: null };
  }
  if (ownedReference) {
    return { operation: "update" as const, eventId: input.lead.follow_up_calendar_event_id! };
  }
  if (input.command.reminderEnabled === true) {
    return {
      operation: "create" as const,
      eventId: deterministicFollowUpReminderId({
        companyId: input.companyId,
        leadId: input.lead.id,
        userId: input.userId
      })
    };
  }
  return { operation: null, eventId: null };
}

function resultFor(input: {
  command: NormalizedFollowUpCommand;
  lead: FollowUpLeadRow;
  calendar: FollowUpCalendarResult;
  partialSuccess: boolean;
  outcome?: FollowUpResult["outcome"];
}): FollowUpResult {
  return {
    ok: true,
    outcome: input.outcome ?? outcomeForAction(input.command.action),
    partialSuccess: input.partialSuccess,
    followUp: {
      at: input.lead.follow_up_at,
      date: input.lead.follow_up_date,
      note: input.lead.follow_up_note,
      completedAt: input.lead.follow_up_completed_at,
      hasCalendarReminder: Boolean(input.lead.follow_up_calendar_event_id)
    },
    calendar: input.calendar
  };
}

export async function manageLeadFollowUpWithDependencies(
  input: ManageLeadFollowUpInput,
  dependencies: FollowUpServiceDependencies
): Promise<ManageLeadFollowUpResponse> {
  const normalized = normalizeFollowUpCommand(input.command);
  if (!normalized.ok) {
    return { ok: false, outcome: "invalid_input", error: normalized.error };
  }
  const command = normalized.value;
  let lead = await dependencies.repository.load({ companyId: input.companyId, leadId: input.leadId });
  if (!lead) return { ok: false, outcome: "not_found", error: "Lead not found." };
  const authorized = await dependencies.authorize({
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    isBearer: input.isBearer,
    leadEventId: lead.event_id
  });
  if (!authorized) return { ok: false, outcome: "unauthorized", error: "Forbidden" };

  const isReplay = lead.follow_up_last_operation_key === command.idempotencyKey;
  if (isReplay && lead.follow_up_last_operation_fingerprint !== command.fingerprint) {
    return { ok: false, outcome: "conflict", error: "Idempotency key was already used for a different request." };
  }
  const replayed = isReplay ? storedResult(lead.follow_up_last_operation_result) : null;
  if (replayed && !replayed.partialSuccess) {
    return { ...replayed, outcome: "duplicate" };
  }

  if (!isReplay) {
    const claimed = await dependencies.repository.claim({
      companyId: input.companyId,
      leadId: input.leadId,
      expectedUpdatedAt: lead.updated_at,
      command,
      patch: semanticPatch(command, dependencies.now())
    });
    if (!claimed) {
      return { ok: false, outcome: "conflict", error: "Follow-up changed; retry with a new idempotency key." };
    }
    lead = claimed;
  }

  const plan = calendarPlan({ command, lead, userId: input.userId, companyId: input.companyId });
  let referencePatch: FollowUpPatch = {};
  let calendar: FollowUpCalendarResult;
  let partialSuccess = false;

  if (plan.operation === "ownership_mismatch") {
    partialSuccess = true;
    calendar = {
      provider: lead.follow_up_calendar_provider,
      requested: true,
      status: "failed",
      operation: command.action === "save" ? "update" : "delete",
      errorCategory: "calendar_owner_mismatch"
    };
  } else if (!plan.operation) {
    calendar = {
      provider: null,
      requested: false,
      status: "not_requested",
      operation: null,
      errorCategory: null
    };
  } else {
    const providerResult = await dependencies.reminderGateway.sync({
      provider: command.reminderProvider,
      operation: plan.operation,
      userId: input.userId,
      companyId: input.companyId,
      eventId: plan.eventId,
      startsAt: command.followUpAt,
      timezone: command.timezone,
      title: `Follow up with ${lead.full_name}`.slice(0, 200)
    });
    if (providerResult.ok) {
      if (plan.operation === "delete") {
        referencePatch = {
          follow_up_calendar_event_id: null,
          follow_up_calendar_provider: null,
          follow_up_calendar_owner_user_id: null
        };
      } else {
        referencePatch = {
          follow_up_calendar_event_id: providerResult.eventId ?? plan.eventId,
          follow_up_calendar_provider: command.reminderProvider,
          follow_up_calendar_owner_user_id: input.userId
        };
      }
      calendar = {
        provider: command.reminderProvider,
        requested: true,
        status: plan.operation === "delete" ? "deleted" : "synced",
        operation: plan.operation,
        errorCategory: null
      };
    } else {
      partialSuccess = true;
      calendar = {
        provider: command.reminderProvider,
        requested: true,
        status: "failed",
        operation: plan.operation,
        errorCategory: providerResult.errorCategory
      };
    }
  }

  const projectedLead = { ...lead, ...referencePatch };
  let result = resultFor({ command, lead: projectedLead, calendar, partialSuccess });
  const finalized = await dependencies.repository.finalize({
    companyId: input.companyId,
    leadId: input.leadId,
    idempotencyKey: command.idempotencyKey,
    patch: referencePatch,
    result
  });
  if (!finalized) {
    result = resultFor({
      command,
      lead,
      partialSuccess: true,
      calendar: {
        provider: calendar.provider,
        requested: calendar.requested,
        status: "failed",
        operation: calendar.operation,
        errorCategory: "follow_up_finalize_failed"
      }
    });
  }
  return result;
}

function createFollowUpRepository(): FollowUpRepository {
  const supabase = createAdminClient() as any;
  return {
    async load(input) {
      const { data, error } = await supabase
        .from("leads")
        .select(FOLLOW_UP_COLUMNS)
        .eq("id", input.leadId)
        .eq("company_id", input.companyId)
        .maybeSingle();
      if (error) throw new Error("Unable to load follow-up.");
      return (data as FollowUpLeadRow | null) ?? null;
    },
    async claim(input) {
      const { data, error } = await supabase
        .from("leads")
        .update({
          ...input.patch,
          follow_up_last_operation_key: input.command.idempotencyKey,
          follow_up_last_operation_fingerprint: input.command.fingerprint,
          follow_up_last_operation_result: { status: "pending" }
        })
        .eq("id", input.leadId)
        .eq("company_id", input.companyId)
        .eq("updated_at", input.expectedUpdatedAt)
        .select(FOLLOW_UP_COLUMNS)
        .maybeSingle();
      if (error) throw new Error("Unable to save follow-up.");
      return (data as FollowUpLeadRow | null) ?? null;
    },
    async finalize(input) {
      const { data, error } = await supabase
        .from("leads")
        .update({ ...input.patch, follow_up_last_operation_result: input.result })
        .eq("id", input.leadId)
        .eq("company_id", input.companyId)
        .eq("follow_up_last_operation_key", input.idempotencyKey)
        .select(FOLLOW_UP_COLUMNS)
        .maybeSingle();
      if (error) return null;
      return (data as FollowUpLeadRow | null) ?? null;
    }
  };
}

function safeGoogleFailureCategory(failure: GoogleCalendarFailure) {
  return failure.category === "unknown_outcome" ? "calendar_unknown_outcome" : failure.category;
}

function createGoogleReminderGateway(): FollowUpReminderGateway {
  return {
    async sync(input) {
      const run = async (forceRefresh: boolean) => {
        const token = await getValidGoogleAccessTokenForUser({
          userId: input.userId,
          companyId: input.companyId,
          forceRefresh
        });
        if (!token.ok) {
          return {
            ok: false as const,
            status: null,
            errorCategory:
              token.reason === "reconnect_required" ? "reconnect_required" : token.category
          };
        }
        const common = { accessToken: token.accessToken, eventId: input.eventId };
        let provider;
        let resolvedEventId = input.eventId;
        if (input.operation === "delete") {
          provider = await deleteGooglePrivateCalendarEvent(common);
        } else {
          if (!input.startsAt || !input.timezone) {
            return { ok: false as const, status: null, errorCategory: "invalid_input" };
          }
          const endsAt = new Date(new Date(input.startsAt).getTime() + 30 * 60_000).toISOString();
          if (input.operation === "create") {
            provider = await createGooglePrivateCalendarEvent({
                ...common,
                startsAt: input.startsAt,
                endsAt,
                timeZone: input.timezone,
                title: input.title
              });
            if (provider.ok) resolvedEventId = provider.eventId;
          } else {
            provider = await updateGooglePrivateCalendarEvent({
                ...common,
                startsAt: input.startsAt,
                endsAt,
                timeZone: input.timezone,
                title: input.title
              });
          }
        }
        return provider.ok
          ? { ok: true as const, status: 200, eventId: resolvedEventId }
          : { ok: false as const, status: provider.status, errorCategory: safeGoogleFailureCategory(provider) };
      };

      let result = await run(false);
      if (!result.ok && result.status === 401) result = await run(true);
      return result.ok
        ? { ok: true, eventId: result.eventId }
        : { ok: false, errorCategory: result.errorCategory };
    }
  };
}

export async function manageLeadFollowUp(
  input: ManageLeadFollowUpInput
): Promise<ManageLeadFollowUpResponse> {
  return manageLeadFollowUpWithDependencies(input, {
    repository: createFollowUpRepository(),
    reminderGateway: createGoogleReminderGateway(),
    authorize: (authorization) =>
      canMutateExhibitorLeadsInContext({
        ...authorization,
        denyExhibitorViewer: false
      }),
    now: () => new Date()
  });
}
