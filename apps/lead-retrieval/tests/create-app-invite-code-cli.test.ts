import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parseCreateAppInviteCodeArgs,
  resolveCreateAppInviteCodeContext,
  runCreateAppInviteCodeCli
} from "../lib/exhibitor/create-app-invite-code-cli";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

test("CLI parser requires explicit normalized email/company/event arguments", () => {
  const parsed = parseCreateAppInviteCodeArgs([
    "--email",
    "  Eric@BearAnalytics.com ",
    "--company-id",
    COMPANY_ID,
    "--event-id",
    EVENT_ID
  ]);
  assert.deepEqual(parsed, {
    email: "eric@bearanalytics.com",
    companyId: COMPANY_ID,
    eventId: EVENT_ID,
    dryRun: false
  });
  assert.throws(() => parseCreateAppInviteCodeArgs(["--email", "eric@bearanalytics.com"]), /company-id/);
  assert.throws(
    () =>
      parseCreateAppInviteCodeArgs([
        "--email",
        "eric@bearanalytics.com",
        "--company-id",
        COMPANY_ID,
        "--event-id",
        "not-a-uuid"
      ]),
    /event-id must be a UUID/
  );
});

test("CLI context resolver accepts owned or exhibitor-assigned events and denies out-of-scope events", async () => {
  const args = parseCreateAppInviteCodeArgs([
    `--email=Eric@BearAnalytics.com`,
    `--company-id=${COMPANY_ID}`,
    `--event-id=${EVENT_ID}`
  ]);
  const base = {
    loadCompany: async () => ({ id: COMPANY_ID, name: "Bear Analytics" }),
    loadEvent: async () => ({ id: EVENT_ID, name: "Expo", companyId: "33333333-3333-4333-8333-333333333333" })
  };

  const assigned = await resolveCreateAppInviteCodeContext(args, {
    ...base,
    hasExhibitorAssignment: async () => true
  });
  assert.equal(assigned.email, "eric@bearanalytics.com");
  assert.equal(assigned.companyName, "Bear Analytics");
  assert.equal(assigned.eventName, "Expo");

  await assert.rejects(
    resolveCreateAppInviteCodeContext(args, {
      ...base,
      hasExhibitorAssignment: async () => false
    }),
    /not associated/
  );
});

test("CLI dry-run validates context without generating a code", async () => {
  let createCalls = 0;
  const result = await runCreateAppInviteCodeCli(
    {
      email: "eric@bearanalytics.com",
      companyId: COMPANY_ID,
      eventId: EVENT_ID,
      dryRun: true
    },
    {
      loadCompany: async () => ({ id: COMPANY_ID, name: "Bear Analytics" }),
      loadEvent: async () => ({ id: EVENT_ID, name: "Expo", companyId: COMPANY_ID }),
      hasExhibitorAssignment: async () => false,
      createInvite: async () => {
        createCalls += 1;
        return { ok: true, appInviteCodes: [] };
      }
    }
  );
  assert.equal(result.code, null);
  assert.equal(createCalls, 0);
});

test("CLI returns exactly one canonical 6-digit code and surfaces service failure", async () => {
  const deps = {
    loadCompany: async () => ({ id: COMPANY_ID, name: "Bear Analytics" }),
    loadEvent: async () => ({ id: EVENT_ID, name: "Expo", companyId: COMPANY_ID }),
    hasExhibitorAssignment: async () => false
  };
  const args = {
    email: "eric@bearanalytics.com",
    companyId: COMPANY_ID,
    eventId: EVENT_ID,
    dryRun: false
  };
  const success = await runCreateAppInviteCodeCli(args, {
    ...deps,
    createInvite: async (context) => ({
      ok: true,
      appInviteCodes: [{ eventId: context.eventId, eventName: context.eventName, code: "042731" }]
    })
  });
  assert.equal(success.code, "042731");

  await assert.rejects(
    runCreateAppInviteCodeCli(args, {
      ...deps,
      createInvite: async () => ({ ok: false, error: "No available seats" })
    }),
    /No available seats/
  );
});

test("operator script delegates to the canonical Company Team invite service and never inserts invite_codes", () => {
  const src = readFileSync(path.join(process.cwd(), "scripts/create-app-invite-code.ts"), "utf8");
  assert.match(src, /createCompanyAppUserInviteCodes/);
  assert.doesNotMatch(src, /\.from\(["']invite_codes["']\).*\.insert\(/s);
  assert.match(src, /sendEmail:\s*false/);
  assert.match(src, /process\.exitCode\s*=\s*1/);
});
