import { EventMemberRole, UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { COPILOT_ACTION_REGISTRY } from "@/lib/copilot/registry";
import type { CopilotActionType, CopilotMode } from "@/lib/copilot/types";

export type CopilotActor = {
  userId: string;
  orgId: string | null;
  role: UserRole;
};

export type CopilotPermissionResult = {
  ok: boolean;
  reason?: string;
  hint?: string;
};

async function ensureEventAccess(input: {
  actor: CopilotActor;
  eventId: string;
  requireWrite: boolean;
}): Promise<CopilotPermissionResult> {
  const event = await getPrisma().event.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      orgId: true,
    },
  });

  if (!event) {
    return {
      ok: false,
      reason: "EVENT_NOT_FOUND",
      hint: "The requested event does not exist.",
    };
  }

  if (input.actor.role !== UserRole.SUPER_ADMIN && input.actor.orgId !== event.orgId) {
    return {
      ok: false,
      reason: "EVENT_SCOPE_FORBIDDEN",
      hint: "This event is outside your active organization scope.",
    };
  }

  if (input.actor.role === UserRole.SUPER_ADMIN) {
    return { ok: true };
  }

  const member = await getPrisma().eventMember.findUnique({
    where: {
      eventId_userId: {
        eventId: input.eventId,
        userId: input.actor.userId,
      },
    },
    select: {
      eventRole: true,
    },
  });

  if (!member) {
    return {
      ok: false,
      reason: "EVENT_MEMBERSHIP_REQUIRED",
      hint: "You must be a member of this event.",
    };
  }

  if (input.requireWrite && member.eventRole === EventMemberRole.EVENT_VIEWER) {
    return {
      ok: false,
      reason: "EVENT_WRITE_FORBIDDEN",
      hint: "Your event role is view-only.",
    };
  }

  return { ok: true };
}

export async function checkCopilotPermission(input: {
  actor: CopilotActor;
  mode: CopilotMode;
  actionType?: CopilotActionType;
  eventId?: string;
}): Promise<CopilotPermissionResult> {
  const { actor, mode, actionType, eventId } = input;

  if (!actor.orgId && actor.role !== UserRole.SUPER_ADMIN) {
    return {
      ok: false,
      reason: "ACTIVE_ORG_REQUIRED",
      hint: "Set an active organization before using Copilot.",
    };
  }

  if (mode === "ask") {
    if (!eventId) return { ok: true };
    return ensureEventAccess({ actor, eventId, requireWrite: false });
  }

  if (!actionType) {
    return {
      ok: false,
      reason: "ACTION_TYPE_REQUIRED",
      hint: "Do mode requires a supported action type.",
    };
  }

  if (actor.role === UserRole.VIEWER) {
    return {
      ok: false,
      reason: "ROLE_FORBIDDEN",
      hint: "Your role does not allow Copilot Do actions.",
    };
  }

  const actionDef = COPILOT_ACTION_REGISTRY[actionType];
  if (!actionDef) {
    return {
      ok: false,
      reason: "ACTION_UNSUPPORTED",
      hint: "This action is not in the Copilot registry.",
    };
  }

  if (actionDef.requiresEvent && !eventId) {
    return {
      ok: false,
      reason: "EVENT_CONTEXT_REQUIRED",
      hint: "This action requires an event context. Open an event first.",
    };
  }

  if (!eventId) {
    return { ok: true };
  }

  return ensureEventAccess({ actor, eventId, requireWrite: true });
}
