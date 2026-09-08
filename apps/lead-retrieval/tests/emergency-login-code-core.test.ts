import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMERGENCY_LOGIN_CODE_ACTION_TYPE,
  generateEmergencyLoginCodeWithDeps,
  type EmergencyLoginActor,
  type EmergencyLoginCodeDeps,
  type EmergencyLoginTargetUser
} from "../lib/server/emergency-login-code-core";

const ROOT = process.cwd();

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

function createHarness(input?: {
  actor?: EmergencyLoginActor | null;
  target?: EmergencyLoginTargetUser | null;
  canGenerate?: boolean;
}) {
  const calls = {
    order: [] as string[],
    otps: [] as string[],
    audits: [] as Array<Record<string, unknown>>
  };

  const target: EmergencyLoginTargetUser | null =
    input?.target === undefined
      ? {
          id: "user-1",
          email: "target@example.com",
          role: "exhibitor_viewer",
          companyId: "company-1",
          eventAccessMode: "assigned_events_only"
        }
      : input.target;

  const deps: EmergencyLoginCodeDeps = {
    loadActor: async () =>
      input?.actor === undefined
        ? { id: "admin-1", role: "exhibitor_admin", companyId: "company-1" }
        : input.actor,
    actorCanGenerateForCompany: async () => input?.canGenerate ?? true,
    loadTargetUser: async () => target,
    loadTargetAppEvents: async () => [
      { eventId: "event-1", eventName: "Expo", permissions: { admin: false, app: true } }
    ],
    generateAuthOtp: async (email) => {
      calls.order.push("otp");
      calls.otps.push(email);
      return {
        ok: true,
        emailOtp: "654321",
        verificationType: "email"
      };
    },
    auditGeneration: async (audit) => {
      calls.order.push("audit");
      calls.audits.push({ ...audit });
      return { ok: true };
    }
  };

  return { deps, calls };
}

test("exhibitor_admin can generate emergency login access for a scoped user", async () => {
  const { deps, calls } = createHarness();

  const result = await generateEmergencyLoginCodeWithDeps(deps, {
    targetUserId: "user-1",
    reason: "Verified by phone; email delivery failed."
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");
  assert.equal(result.targetEmail, "target@example.com");
  assert.deepEqual(result.loginCode, { code: "654321", verificationType: "email" });
  assert.doesNotMatch(JSON.stringify(result), /https?:\/\//);
  assert.deepEqual(calls.order, ["otp", "audit"]);
  assert.deepEqual(calls.otps, ["target@example.com"]);
});

test("exhibitor_admin cannot generate for a user outside company scope", async () => {
  const { deps, calls } = createHarness({
    target: {
      id: "user-2",
      email: "outside@example.com",
      role: "exhibitor_viewer",
      companyId: "company-2",
      eventAccessMode: "assigned_events_only"
    }
  });

  const result = await generateEmergencyLoginCodeWithDeps(deps, {
    targetUserId: "user-2",
    reason: "Support escalation"
  });

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, "User is not in your company.");
  assert.equal(calls.otps.length, 0);
  assert.equal(calls.audits.length, 0);
});

test("viewer/app_user cannot generate emergency login access", async () => {
  const { deps, calls } = createHarness({
    actor: { id: "viewer-1", role: "viewer", companyId: "company-1" }
  });

  const result = await generateEmergencyLoginCodeWithDeps(deps, {
    targetUserId: "user-1",
    reason: "Support escalation"
  });

  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : "", /Only authorized admins/);
  assert.equal(calls.otps.length, 0);
  assert.equal(calls.audits.length, 0);
});

test("platform_admin can generate emergency login access from Platform Admin support scope", async () => {
  const { deps, calls } = createHarness({
    actor: {
      id: "platform-1",
      role: "platform_admin",
      companyId: "company-2",
      activeCompanyId: "company-2"
    },
    target: {
      id: "user-2",
      email: "scoped@example.com",
      role: "viewer",
      companyId: "company-2",
      eventAccessMode: "all_company_events"
    },
    canGenerate: true
  });

  const result = await generateEmergencyLoginCodeWithDeps(deps, {
    targetUserId: "user-2",
    reason: "Platform support verified identity."
  });

  assert.equal(result.ok, true);
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.audits[0]?.actingAdminUserId, "platform-1");
  assert.equal(calls.audits[0]?.companyId, "company-2");
  assert.deepEqual(calls.order, ["otp", "audit"]);
});

test("platform_admin still requires server-side company authorization approval", async () => {
  const { deps, calls } = createHarness({
    actor: {
      id: "platform-1",
      role: "platform_admin",
      companyId: "company-1",
      activeCompanyId: "company-1"
    },
    target: {
      id: "user-2",
      email: "scoped@example.com",
      role: "viewer",
      companyId: "company-2",
      eventAccessMode: "all_company_events"
    },
    canGenerate: false
  });

  const result = await generateEmergencyLoginCodeWithDeps(deps, {
    targetUserId: "user-2",
    reason: "Platform support verified identity."
  });

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, "Forbidden.");
  assert.equal(calls.otps.length, 0);
  assert.equal(calls.audits.length, 0);
});

test("reason is required before any secret is generated", async () => {
  const { deps, calls } = createHarness();

  const result = await generateEmergencyLoginCodeWithDeps(deps, {
    targetUserId: "user-1",
    reason: "   "
  });

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, "Reason is required.");
  assert.equal(calls.otps.length, 0);
  assert.equal(calls.audits.length, 0);
});

test("audit log is written without persisting generated secrets for later display", async () => {
  const { deps, calls } = createHarness();

  const result = await generateEmergencyLoginCodeWithDeps(deps, {
    targetUserId: "user-1",
    reason: "Identity verified by booth manager."
  });

  assert.equal(result.ok, true);
  assert.equal(calls.audits.length, 1);
  assert.deepEqual(calls.audits[0], {
    actionType: EMERGENCY_LOGIN_CODE_ACTION_TYPE,
    actingAdminUserId: "admin-1",
    targetUserId: "user-1",
    targetEmail: "target@example.com",
    companyId: "company-1",
    eventIds: ["event-1"],
    reason: "Identity verified by booth manager.",
    method: "emergency_login_code",
    appCodeCount: 0
  });
  assert.doesNotMatch(JSON.stringify(calls.audits[0]), /654321|emailOtp|loginCode|actionLink|authLink|url/);
});

test("OTP generation failure is returned and does not write a misleading audit row", async () => {
  const { deps, calls } = createHarness();
  deps.generateAuthOtp = async () => ({ ok: false, error: "Auth provider unavailable." });

  const result = await generateEmergencyLoginCodeWithDeps(deps, {
    targetUserId: "user-1",
    reason: "Verified by support."
  });

  assert.deepEqual(result, { ok: false, error: "Auth provider unavailable." });
  assert.equal(calls.audits.length, 0);
});

test("emergency login implementation keeps route/action thin and client copy explicit", () => {
  const actions = read("app/(app)/exhibitor/users/actions.ts");
  const platformActions = read("app/admin/company-licenses/users/actions.ts");
  const platformClient = read("components/admin/company-scoped-users-row-actions.tsx");
  const client = read("app/(app)/exhibitor/users/users-client.tsx");
  const service = read("lib/server/emergency-login-code.ts");
  const migration = read("supabase/migrations/0085_emergency_login_code_audit_events.sql");
  const methodMigration = read("supabase/migrations/0086_emergency_login_code_audit_method.sql");
  const methodRepairMigration = read("supabase/migrations/0099_emergency_login_code_audit_method_repair.sql");

  assert.match(actions, /generateEmergencyLoginCodeForUser\(\{ targetUserId, reason \}\)/);
  assert.match(platformActions, /generateCompanyScopedUserLoginCodeFromAdminAction/);
  assert.match(platformActions, /requirePlatformAdmin\(\)/);
  assert.match(platformActions, /method:\s*"platform_admin_company_scoped_users"/);
  assert.match(platformClient, /Emergency Login Code/);
  assert.match(platformClient, /Use this only when the user cannot receive the normal login email\./);
  assert.match(platformClient, /Shown once only/);
  assert.match(platformClient, /Copy/);
  assert.match(service, /getUserHasExhibitorWebAdminAccess/);
  assert.match(service, /properties\?\.email_otp/);
  assert.doesNotMatch(service, /properties\?\.action_link|createInviteCode/);
  assert.match(service, /actor\.activeCompanyId/);
  assert.match(service, /\.from\("emergency_login_code_audit_events"\)/);
  assert.match(service, /method:\s*audit\.method/);
  assert.match(client, /Emergency\/support action/);
  assert.match(client, /Shown once only/);
  assert.match(client, /Nothing will be emailed automatically/);
  assert.match(client, /Emergency Login Code for/);
  assert.match(client, /expires and can be redeemed only once/);
  assert.doesNotMatch(client, /Login link|authLink|appInviteCodes|https?:\/\//);
  assert.doesNotMatch(platformClient, /Login link|authLink|appInviteCodes|https?:\/\//);
  assert.doesNotMatch(migration, /action_link|auth_link|login_link|token|secret|code text|code_hash/);
  assert.match(methodMigration, /add column if not exists method text not null default 'emergency_login_code'/);
  assert.doesNotMatch(methodMigration, /action_link|auth_link|login_link|token|secret|code text|code_hash/);
  assert.match(methodRepairMigration, /add column if not exists method text/);
  assert.match(methodRepairMigration, /set method = 'emergency_login_code'/);
  assert.match(methodRepairMigration, /alter column method set default 'emergency_login_code'/);
  assert.match(methodRepairMigration, /alter column method set not null/);
  assert.match(methodRepairMigration, /notify pgrst, 'reload schema'/);
  assert.doesNotMatch(methodRepairMigration, /action_link|auth_link|login_link|token|secret|code text|code_hash/);
});

test("web and mobile use the canonical Supabase email OTP verifier for the emergency credential", () => {
  const webLogin = read("app/(public)/login/login-form.tsx");
  const mobileLoginPath = join(ROOT, "../lead-intel-scan/app/(auth)/sign-in.tsx");

  assert.match(webLogin, /Use an Emergency Login Code/);
  assert.match(webLogin, /type:\s*"email"/);
  assert.match(webLogin, /supabase\.auth\.verifyOtp/);
  assert.doesNotMatch(webLogin, /action_link|Login link/);

  if (existsSync(mobileLoginPath)) {
    const mobileLogin = readFileSync(mobileLoginPath, "utf8");
    assert.match(mobileLogin, /supabase\.auth\.verifyOtp/);
    assert.match(mobileLogin, /type:\s*'email'/);
    assert.doesNotMatch(mobileLogin, /action_link/);
  }
});

test("emergency audit write is action-only and normal Users-page loading does not query the audit table", () => {
  const page = read("app/(app)/exhibitor/users/page.tsx");
  const client = read("app/(app)/exhibitor/users/users-client.tsx");
  const service = read("lib/server/emergency-login-code.ts");

  assert.doesNotMatch(page, /emergency_login_code_audit_events/);
  assert.doesNotMatch(client, /emergency_login_code_audit_events/);
  const handler = client.match(/async function handleEmergencyLoginSubmit[\s\S]*?\n  \}/)?.[0];
  assert.ok(handler, "expected emergency-login submit handler");
  assert.match(handler, /generateEmergencyLoginCodeAction\(formData\)/);
  assert.equal(
    (service.match(/\.from\("emergency_login_code_audit_events"\)/g) ?? []).length,
    1,
    "the canonical emergency action service owns the only audit-table write"
  );
  assert.match(service, /method:\s*audit\.method/);
});
