export const EMERGENCY_LOGIN_CODE_ACTION_TYPE = "emergency_login_code_generated" as const;

export type EmergencyLoginActor = {
  id: string;
  role: string | null;
  companyId: string | null;
  activeCompanyId?: string | null;
};

export type EmergencyLoginTargetUser = {
  id: string;
  email: string | null;
  role: string | null;
  companyId: string | null;
  eventAccessMode: "all_company_events" | "assigned_events_only";
};

export type EmergencyLoginAppEvent = {
  eventId: string;
  eventName: string;
  permissions: { admin: boolean; app: boolean };
};

export type EmergencyLoginOtp = {
  code: string;
  verificationType: "email";
};

export type EmergencyLoginCodeResult =
  | {
      ok: true;
      message: string;
      targetEmail: string;
      loginCode: EmergencyLoginOtp;
    }
  | { ok: false; error: string };

export type EmergencyLoginCodeDeps = {
  loadActor: () => Promise<EmergencyLoginActor | null>;
  actorCanGenerateForCompany: (actor: EmergencyLoginActor, companyId: string) => Promise<boolean>;
  loadTargetUser: (targetUserId: string) => Promise<EmergencyLoginTargetUser | null>;
  loadTargetAppEvents: (target: EmergencyLoginTargetUser) => Promise<EmergencyLoginAppEvent[]>;
  generateAuthOtp: (
    email: string
  ) => Promise<{ ok: true; emailOtp: string; verificationType: "email" } | { ok: false; error: string }>;
  auditGeneration: (input: {
    actionType: typeof EMERGENCY_LOGIN_CODE_ACTION_TYPE;
    actingAdminUserId: string;
    targetUserId: string;
    targetEmail: string;
    companyId: string;
    eventIds: string[];
    reason: string;
    method: string;
    appCodeCount: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function normalizeRole(role: string | null | undefined) {
  const value = String(role ?? "").trim().toLowerCase();
  if (value === "event_organizer" || value === "organizer") return "organizer_admin";
  return value;
}

function isDisallowedTargetRole(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return normalized === "platform_admin" || normalized === "organizer_admin";
}

export async function generateEmergencyLoginCodeWithDeps(
  deps: EmergencyLoginCodeDeps,
  input: { targetUserId: string; reason: string; method?: string }
): Promise<EmergencyLoginCodeResult> {
  const targetUserId = String(input.targetUserId ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  const method = String(input.method ?? "emergency_login_code").trim() || "emergency_login_code";

  if (!targetUserId) {
    return { ok: false, error: "Missing user." };
  }
  if (!reason) {
    return { ok: false, error: "Reason is required." };
  }

  const actor = await deps.loadActor();
  if (!actor?.id) {
    return { ok: false, error: "Unauthorized." };
  }

  const actorRole = normalizeRole(actor.role);
  if (actorRole !== "exhibitor_admin" && actorRole !== "platform_admin") {
    return { ok: false, error: "Only authorized admins can generate emergency login codes." };
  }

  const target = await deps.loadTargetUser(targetUserId);
  if (!target?.id) {
    return { ok: false, error: "User not found." };
  }

  const companyId = String(target.companyId ?? "").trim();
  if (!companyId) {
    return { ok: false, error: "Target user is missing a company scope." };
  }

  if (actorRole === "exhibitor_admin" && String(actor.companyId ?? "").trim() !== companyId) {
    return { ok: false, error: "User is not in your company." };
  }

  const canGenerate = await deps.actorCanGenerateForCompany(actor, companyId);
  if (!canGenerate) {
    return { ok: false, error: "Forbidden." };
  }

  if (isDisallowedTargetRole(target.role)) {
    return { ok: false, error: "Emergency login codes are only available for exhibitor users." };
  }

  const email = String(target.email ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "User has no email on file." };
  }

  const appEvents = await deps.loadTargetAppEvents(target);
  const generated = await deps.generateAuthOtp(email);
  if (!generated.ok) {
    return { ok: false, error: generated.error };
  }

  const audit = await deps.auditGeneration({
    actionType: EMERGENCY_LOGIN_CODE_ACTION_TYPE,
    actingAdminUserId: actor.id,
    targetUserId: target.id,
    targetEmail: email,
    companyId,
    eventIds: appEvents.map((event) => event.eventId),
    reason,
    method,
    appCodeCount: 0
  });
  if (!audit.ok) {
    return { ok: false, error: audit.error };
  }

  return {
    ok: true,
    message: "Emergency Login Code generated. It will not be shown again after this dialog is closed.",
    targetEmail: email,
    loginCode: {
      code: generated.emailOtp,
      verificationType: generated.verificationType
    }
  };
}
