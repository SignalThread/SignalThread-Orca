import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  orchestrateCompanyAppUserInvite,
  type AppUserInviteOrchestrateDeps
} from "../lib/exhibitor/company-team-app-user-invite";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("inviteCompanyMemberAction source routes viewer (App user) to mobile codes before web-admin invite service", () => {
  const src = read("lib/server/company-team-management.ts");

  const fn = src.match(
    /export async function inviteCompanyMemberAction[\s\S]*?\n\}\n/
  )?.[0];
  assert.ok(fn, "expected to locate inviteCompanyMemberAction body");

  const viewerGateIdx = fn.indexOf('companyRole === "viewer"');
  const webAdminInviteIdx = fn.indexOf("createCompanyScopedInvite");
  assert.notEqual(viewerGateIdx, -1, "viewer short-circuit branch must exist");
  assert.notEqual(webAdminInviteIdx, -1, "exhibitor-admin branch must route through canonical company-scoped invite service");
  assert.ok(
    viewerGateIdx < webAdminInviteIdx,
    "viewer (app user) branch must return before the web-admin invite service is called"
  );

  const mobileBranch = fn.slice(viewerGateIdx, webAdminInviteIdx);
  assert.match(mobileBranch, /createCompanyAppUserInviteCodes|orchestrateCompanyAppUserInvite/);
  assert.doesNotMatch(
    mobileBranch,
    /auth\.admin\.inviteUserByEmail/,
    "viewer (app user) branch must never call the web auth invite email"
  );
});

test("orchestrator never calls supabase.auth.* (strip comments, then grep)", () => {
  const raw = read("lib/exhibitor/company-team-app-user-invite.ts");
  const codeOnly = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(
    codeOnly,
    /auth\s*\.\s*admin\s*\.\s*inviteUserByEmail/,
    "orchestrator code must not call auth.admin.inviteUserByEmail"
  );
  assert.doesNotMatch(codeOnly, /supabase\s*\.\s*auth\b/);
  assert.match(raw, /orchestrateCompanyAppUserInvite/);
});

type InviteCall = {
  eventId: string;
  exhibitorCompanyId: string;
  email: string;
  permissions: { admin: boolean; app: boolean };
};

type EmailCall = {
  to: string;
  items: ReadonlyArray<{ eventName: string; code: string }>;
};

type HarnessState = {
  inviteCalls: InviteCall[];
  emailCalls: EmailCall[];
  deleteCalls: string[][];
  clearCalls: number;
};

function makeDeps(input: {
  events: Array<{ id: string; name: string | null }>;
  emailConfigured: boolean;
  codeGenerator?: () => string;
}): { deps: AppUserInviteOrchestrateDeps; state: HarnessState } {
  const state: HarnessState = {
    inviteCalls: [],
    emailCalls: [],
    deleteCalls: [],
    clearCalls: 0
  };

  const supabase = {
    from() {
      throw new Error("orchestrator must not call supabase.from() directly");
    },
    auth: new Proxy(
      {},
      {
        get() {
          throw new Error("orchestrator must not call supabase.auth.*");
        }
      }
    )
  } as unknown as AppUserInviteOrchestrateDeps["supabase"];

  const nextCode = input.codeGenerator ?? (() => "123456");

  const deps: AppUserInviteOrchestrateDeps = {
    supabase,
    loadCompanyEvents: async () => ({ ok: true, events: input.events }),
    clearPendingInvitesForEvents: async () => {
      state.clearCalls += 1;
      return { ok: true };
    },
    deleteInviteCodesByIds: async (ids) => {
      state.deleteCalls.push([...ids]);
    },
    createInviteCode: async (args) => {
      state.inviteCalls.push(args);
      return {
        code: nextCode(),
        invite: { id: `invite-${state.inviteCalls.length}` }
      };
    },
    sendAppUserInviteEmail: async (args) => {
      state.emailCalls.push({ to: args.to, items: [...args.items] });
    },
    isEmailConfigured: () => input.emailConfigured
  };

  return { deps, state };
}

test("App user invite creates exactly one invite_codes row per event and exactly one email", async () => {
  const { deps, state } = makeDeps({
    events: [
      { id: "e1", name: "Event One" },
      { id: "e2", name: "Event Two" }
    ],
    emailConfigured: true,
    codeGenerator: (() => {
      let i = 0;
      return () => String(100000 + ++i);
    })()
  });

  const result = await orchestrateCompanyAppUserInvite(deps, {
    companyId: "co1",
    email: "booth@example.com",
    eventAccessMode: "all_company_events",
    assignedEventIds: []
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");
  assert.equal(state.inviteCalls.length, 2, "one invite_codes row per event");
  assert.equal(state.emailCalls.length, 1, "exactly one email per action");
  assert.equal(state.clearCalls, 1, "pending invites cleared once before creates");
  assert.deepEqual(state.deleteCalls, [], "no rollback when all succeed");
  assert.equal(result.appInviteCodes?.length, 2);
  assert.equal(result.appInviteCodes?.[0]?.eventId, "e1");
  assert.equal(result.appInviteCodes?.[1]?.eventId, "e2");
  assert.equal(state.emailCalls[0]?.items.length, 2);
});

test("App user invite does NOT send email when SendGrid is not configured (still returns codes)", async () => {
  const { deps, state } = makeDeps({
    events: [{ id: "e1", name: "Event One" }],
    emailConfigured: false
  });

  const result = await orchestrateCompanyAppUserInvite(deps, {
    companyId: "co1",
    email: "booth@example.com",
    eventAccessMode: "assigned_events_only",
    assignedEventIds: ["e1"]
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");
  assert.equal(state.inviteCalls.length, 1);
  assert.equal(state.emailCalls.length, 0, "email not sent when provider disabled");
  assert.equal(result.appInviteCodes?.length, 1);
  assert.match(String(result.message), /Email is not configured/);
});

test("App user invite preserves and returns created codes when email delivery fails", async () => {
  const deleteCalls: string[][] = [];
  const inviteCalls: InviteCall[] = [];
  let emailCalls = 0;

  const deps: AppUserInviteOrchestrateDeps = {
    supabase: {} as any,
    loadCompanyEvents: async () => ({
      ok: true,
      events: [
        { id: "e1", name: "E1" },
        { id: "e2", name: "E2" }
      ]
    }),
    clearPendingInvitesForEvents: async () => ({ ok: true }),
    deleteInviteCodesByIds: async (ids) => {
      deleteCalls.push([...ids]);
    },
    createInviteCode: async (args) => {
      inviteCalls.push(args);
      return { code: "000000", invite: { id: `id-${inviteCalls.length}` } };
    },
    sendAppUserInviteEmail: async () => {
      emailCalls += 1;
      throw new Error("sendgrid boom");
    },
    isEmailConfigured: () => true
  };

  const r = await orchestrateCompanyAppUserInvite(deps, {
    companyId: "co1",
    email: "booth@example.com",
    eventAccessMode: "all_company_events",
    assignedEventIds: []
  });

  assert.equal(r.ok, true);
  if (!r.ok) throw new Error("expected created codes to remain usable");
  assert.match(String(r.message), /email delivery failed.*sendgrid boom/i);
  assert.deepEqual(r.appInviteCodes?.map((item) => item.code), ["000000", "000000"]);
  assert.equal(emailCalls, 1, "email attempted once");
  assert.equal(inviteCalls.length, 2, "both codes were created before email");
  assert.deepEqual(deleteCalls, [], "email transport must not invalidate successfully created codes");
});

test("App user invite rolls back partial invite_codes when createInviteCode fails mid-loop", async () => {
  const deleteCalls: string[][] = [];
  const inviteCalls: InviteCall[] = [];

  const deps: AppUserInviteOrchestrateDeps = {
    supabase: {} as any,
    loadCompanyEvents: async () => ({
      ok: true,
      events: [
        { id: "e1", name: "E1" },
        { id: "e2", name: "E2" }
      ]
    }),
    clearPendingInvitesForEvents: async () => ({ ok: true }),
    deleteInviteCodesByIds: async (ids) => {
      deleteCalls.push([...ids]);
    },
    createInviteCode: async (args) => {
      inviteCalls.push(args);
      if (inviteCalls.length === 2) {
        throw new Error("license denies second seat");
      }
      return { code: "000000", invite: { id: `id-${inviteCalls.length}` } };
    },
    isEmailConfigured: () => true,
    sendAppUserInviteEmail: async () => {
      throw new Error("email should not be called after code-create failure");
    }
  };

  const r = await orchestrateCompanyAppUserInvite(deps, {
    companyId: "co1",
    email: "booth@example.com",
    eventAccessMode: "all_company_events",
    assignedEventIds: []
  });

  assert.equal(r.ok, false);
  if (r.ok) throw new Error("expected failure");
  assert.match(r.error, /license denies second seat/);
  assert.equal(inviteCalls.length, 2);
  assert.deepEqual(deleteCalls, [["id-1"]], "first created row was rolled back");
});

test("App user invite errors with clear message when no events match", async () => {
  const { deps } = makeDeps({ events: [], emailConfigured: true });
  const r = await orchestrateCompanyAppUserInvite(deps, {
    companyId: "co1",
    email: "booth@example.com",
    eventAccessMode: "assigned_events_only",
    assignedEventIds: []
  });
  assert.equal(r.ok, false);
  if (r.ok) throw new Error("expected failure");
  assert.match(r.error, /Create at least one company event/);
});

test("team-actions.ts export shape tolerates appInviteCodes on success", () => {
  const src = read("app/app/settings/team-actions.ts");
  assert.match(src, /appInviteCodes\??: Array<\{ eventId: string; eventName: string; code: string \}>/);
});

test("Account settings client shows invite codes in banner after success", () => {
  const src = read("app/app/settings/company-team-settings-client.tsx");
  assert.match(src, /appInviteCodes/);
  assert.match(src, /Mobile app invite codes/);
  assert.match(
    src,
    /setBanner\(\{[\s\S]*?appInviteCodes:\s*r\.appInviteCodes[\s\S]*?\}\)/,
    "submit success must put returned codes in the rendered banner"
  );
  assert.doesNotMatch(src, /appInviteModal/, "do not store invite codes in unrendered state");
});

test("Account settings client surfaces rejected actions and synchronously guards repeat invite submission", () => {
  const src = read("app/app/settings/company-team-settings-client.tsx");
  assert.match(src, /catch \(error\)[\s\S]*?Invite generation failed/);
  assert.match(src, /inviteSubmissionRef\.current/);
  assert.match(src, /disabled=\{isPending \|\| isInviteSubmitting\}/);
});

test("Company Team server guard accepts only canonical company-account admin sessions", () => {
  const src = read("lib/server/company-team-management.ts");
  const guard = src.match(/async function getActorExhibitorAdminCompanyId[\s\S]*?\n\}/)?.[0];
  assert.ok(guard, "expected Company Team actor guard");
  assert.match(guard, /isCompanyAccountAdminSession\(sessionUser\)/);
  assert.match(guard, /sessionUser\.company_id/);
  assert.doesNotMatch(guard, /role\s*!==\s*["']exhibitor_admin["']/);
});

test("App user invite email includes the 6-digit code placeholder, mobile-app instructions, and recovery copy", () => {
  const src = read("lib/server/email/sendInviteEmail.ts");

  const fn = src.match(
    /export async function sendCompanyTeamAppUserInviteEmail[\s\S]*?\n\}\n/
  )?.[0];
  assert.ok(fn, "expected sendCompanyTeamAppUserInviteEmail body");

  assert.match(fn, /it\.code/, "email body interpolates the per-event 6-digit code");
  assert.match(fn, /6-digit code/, "email body labels the code as 6-digit");
  assert.match(fn, /mobile app/i, "email body references the mobile app for redemption");

  assert.match(
    fn,
    /If you already created an account, sign in with this email\./,
    "recovery copy: sign-in guidance present in email"
  );
  assert.match(
    fn,
    /If you forgot your password, use (?:<strong>)?Reset password(?:<\/strong>)?\./,
    "recovery copy: reset-password guidance present in email"
  );

  assert.doesNotMatch(
    fn,
    /auth\.admin\.inviteUserByEmail/,
    "email helper must never call Supabase web-auth invite"
  );
});

test("App user invite is idempotent: clearPendingInvitesForEvents runs before create, retry doesn't duplicate pending codes", async () => {
  const { deps, state } = makeDeps({
    events: [
      { id: "e1", name: "Event One" },
      { id: "e2", name: "Event Two" }
    ],
    emailConfigured: true,
    codeGenerator: (() => {
      let i = 0;
      return () => String(200000 + ++i);
    })()
  });

  const callOrder: string[] = [];
  const originalClear = deps.clearPendingInvitesForEvents;
  const originalCreate = deps.createInviteCode;
  deps.clearPendingInvitesForEvents = async (args) => {
    callOrder.push(`clear:${args.eventIds.join(",")}`);
    return originalClear(args);
  };
  deps.createInviteCode = async (args) => {
    callOrder.push(`create:${args.eventId}`);
    return originalCreate(args);
  };

  const first = await orchestrateCompanyAppUserInvite(deps, {
    companyId: "co1",
    email: "booth@example.com",
    eventAccessMode: "all_company_events",
    assignedEventIds: []
  });
  assert.equal(first.ok, true);

  const second = await orchestrateCompanyAppUserInvite(deps, {
    companyId: "co1",
    email: "booth@example.com",
    eventAccessMode: "all_company_events",
    assignedEventIds: []
  });
  assert.equal(second.ok, true);

  assert.equal(state.clearCalls, 2, "every invocation clears prior pending invites before creating new ones");
  assert.equal(state.inviteCalls.length, 4, "4 total codes across two full runs (2 events x 2 retries)");

  const firstRunIdx = callOrder.indexOf("clear:e1,e2");
  const firstCreateIdx = callOrder.indexOf("create:e1");
  assert.notEqual(firstRunIdx, -1);
  assert.notEqual(firstCreateIdx, -1);
  assert.ok(
    firstRunIdx < firstCreateIdx,
    "clearPendingInvitesForEvents must be called BEFORE createInviteCode so retries cannot leave duplicates"
  );
});

test("Admin-side invite_codes deletes are scoped to used_at IS NULL — redeemed historical rows are preserved", () => {
  const mgmt = [
    read("lib/server/company-team-management.ts"),
    read("lib/server/invites/create-company-app-user-invite.ts")
  ].join("\n");

  const deleteBlocks = [
    ...mgmt.matchAll(
      /\.from\(["']invite_codes["']\)\s*\.delete\(\)([\s\S]*?)(?:;|\n\s*\})/g
    )
  ].map((m) => m[0]);

  assert.ok(
    deleteBlocks.length >= 2,
    `expected at least 2 admin-side invite_codes deletes; found ${deleteBlocks.length}`
  );

  const rollbackBlock = deleteBlocks.find((b) => /\.in\(["']id["']/.test(b));
  const scopedBlocks = deleteBlocks.filter((b) => b !== rollbackBlock);

  assert.ok(rollbackBlock, "rollback-by-id delete must exist for orchestrator cleanup");
  assert.ok(
    scopedBlocks.length >= 2,
    "at least two scoped (non-rollback) invite_codes deletes must exist"
  );

  for (const block of scopedBlocks) {
    assert.match(
      block,
      /\.is\(["']used_at["'],\s*null\)/,
      `scoped invite_codes delete must include .is("used_at", null) so redeemed rows are preserved. Block:\n${block}`
    );
  }
});

test("Admin-side code never consumes invite codes (no writes to used_at / used_by_user_id outside /api/invites/*)", () => {
  const adminFiles = [
    "lib/server/company-team-management.ts",
    "lib/exhibitor/company-team-app-user-invite.ts",
    "lib/exhibitor/company-team-delete-verify.ts",
    "app/app/settings/team-actions.ts"
  ];

  for (const rel of adminFiles) {
    const src = read(rel);
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    assert.doesNotMatch(
      codeOnly,
      /used_at\s*:\s*(?!null\b)/,
      `${rel} must not assign a non-null used_at (only /api/invites/redeem and /api/invites/claim may consume codes)`
    );
    assert.doesNotMatch(
      codeOnly,
      /used_by_user_id\s*:\s*(?!null\b)/,
      `${rel} must not assign used_by_user_id (only /api/invites/redeem and /api/invites/claim may consume codes)`
    );
  }
});

test("Canonical Company Team invite service scopes invite_codes clear by company + email + eventIds + used_at IS NULL", () => {
  const src = read("lib/server/invites/create-company-app-user-invite.ts");

  const wiring = src.match(
    /clearPendingInvitesForEvents:\s*async[\s\S]*?\n\s{6}\},/
  )?.[0];
  assert.ok(wiring, "expected clearPendingInvitesForEvents inline wiring");

  assert.match(wiring, /\.from\(["']invite_codes["']\)/);
  assert.match(wiring, /\.delete\(\)/);
  assert.match(wiring, /\.eq\(["']exhibitor_company_id["']/);
  assert.match(wiring, /\.eq\(["']email["']/);
  assert.match(wiring, /\.in\(["']event_id["']/);
  assert.match(
    wiring,
    /\.is\(["']used_at["'],\s*null\)/,
    "clear must only target pending (used_at IS NULL) rows — redeemed codes must not be deleted on retry"
  );
  assert.match(src, /export async function createCompanyAppUserInviteCodes/);
});
