import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CREATE_EMERGENCY_LOGIN_CODE_USAGE,
  EMERGENCY_LOGIN_CLI_METHOD,
  EMERGENCY_LOGIN_CLI_REASON,
  normalizeEmergencyLoginEmail,
  parseCreateEmergencyLoginCodeArgs,
  resolveEmergencyLoginTargetByEmail,
  runCreateEmergencyLoginCodeCli,
  runCreateEmergencyLoginCodeCommand,
  type EmergencyLoginEmailCandidate
} from "../lib/server/emergency-login-code-cli-core";
import { main as runScriptMain } from "../scripts/create-emergency-login-code";

const TARGET: EmergencyLoginEmailCandidate = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "eric@bearanalytics.com",
  role: "exhibitor_admin",
  companyId: "22222222-2222-4222-8222-222222222222",
  companyName: "Bear Analytics"
};

test("CLI parser requires one valid email and normalizes it", () => {
  assert.deepEqual(
    parseCreateEmergencyLoginCodeArgs(["--email", "  Eric@BearAnalytics.com  "]),
    { email: "eric@bearanalytics.com" }
  );
  assert.deepEqual(parseCreateEmergencyLoginCodeArgs(["--email=Eric@BearAnalytics.com"]), {
    email: "eric@bearanalytics.com"
  });
  assert.equal(normalizeEmergencyLoginEmail("  Eric@BearAnalytics.com "), "eric@bearanalytics.com");
  assert.throws(() => parseCreateEmergencyLoginCodeArgs([]), /--email is required/);
  assert.throws(() => parseCreateEmergencyLoginCodeArgs(["--email", "not-an-email"]), /valid email/);
  assert.throws(
    () =>
      parseCreateEmergencyLoginCodeArgs([
        "--email=one@example.com",
        "--email=two@example.com"
      ]),
    /only be provided once/
  );
});

test("email resolution returns one exact canonical LR user", () => {
  const resolved = resolveEmergencyLoginTargetByEmail("ERIC@BEARANALYTICS.COM", [
    TARGET,
    { ...TARGET, id: "other", email: "other@example.com" }
  ]);
  assert.equal(resolved.id, TARGET.id);
  assert.equal(resolved.companyId, TARGET.companyId);
});

test("email resolution fails closed for no match or ambiguous accounts", () => {
  assert.throws(
    () => resolveEmergencyLoginTargetByEmail("missing@example.com", []),
    /No LR user was found/
  );

  assert.throws(
    () =>
      resolveEmergencyLoginTargetByEmail("eric@bearanalytics.com", [
        TARGET,
        {
          ...TARGET,
          id: "33333333-3333-4333-8333-333333333333",
          companyId: "44444444-4444-4444-8444-444444444444",
          companyName: "Bear Analytics West"
        }
      ]),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      assert.match(message, /Multiple LR users match/);
      assert.match(message, /Bear Analytics/);
      assert.match(message, /Bear Analytics West/);
      assert.match(message, /refusing to guess/);
      return true;
    }
  );

  assert.throws(
    () =>
      resolveEmergencyLoginTargetByEmail("eric@bearanalytics.com", [
        {
          ...TARGET,
          membershipCompanies: [
            { id: TARGET.companyId!, name: TARGET.companyName },
            {
              id: "55555555-5555-4555-8555-555555555555",
              name: "Bear Analytics Canada"
            }
          ]
        }
      ]),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      assert.match(message, /multiple company scopes/);
      assert.match(message, /Bear Analytics Canada/);
      assert.match(message, /refusing to guess/);
      return true;
    }
  );
});

test("CLI invokes the canonical emergency service with the audit method and returns OTP only", async () => {
  const calls: Array<{ email: string; reason: string; method: string }> = [];
  const result = await runCreateEmergencyLoginCodeCli(
    ["--email", "Eric@BearAnalytics.com"],
    {
      generateEmergencyLoginCode: async (input) => {
        calls.push(input);
        return {
          ok: true,
          message: "generated",
          targetEmail: input.email,
          loginCode: { code: "042731", verificationType: "email" }
        };
      }
    }
  );

  assert.deepEqual(calls, [
    {
      email: "eric@bearanalytics.com",
      reason: EMERGENCY_LOGIN_CLI_REASON,
      method: EMERGENCY_LOGIN_CLI_METHOD
    }
  ]);
  assert.deepEqual(result, { email: "eric@bearanalytics.com", code: "042731" });
  assert.doesNotMatch(JSON.stringify(result), /https?:\/\/|action_link|magiclink/i);
});

test("CLI surfaces canonical generation and audit failures", async () => {
  await assert.rejects(
    runCreateEmergencyLoginCodeCli(["--email=user@example.com"], {
      generateEmergencyLoginCode: async () => ({ ok: false, error: "Failed writing audit log." })
    }),
    /Failed writing audit log/
  );
  await assert.rejects(
    runCreateEmergencyLoginCodeCli(["--email=user@example.com"], {
      generateEmergencyLoginCode: async () => ({ ok: false, error: "Supabase OTP generation failed." })
    }),
    /Supabase OTP generation failed/
  );
});

test("command prints the raw code exactly once and failures exit non-zero with usage", async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const successCode = await runCreateEmergencyLoginCodeCommand(
    ["--email=user@example.com"],
    {
      generateEmergencyLoginCode: async () => ({
        ok: true,
        message: "generated",
        targetEmail: "user@example.com",
        loginCode: { code: "123456", verificationType: "email" }
      })
    },
    { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) }
  );
  assert.equal(successCode, 0);
  assert.deepEqual(stdout, ["Emergency Login Code\nEmail: user@example.com\nCode: 123456"]);
  assert.equal(stdout[0]!.match(/123456/g)?.length, 1);
  assert.doesNotMatch(stdout[0]!, /https?:\/\/|action_link|magiclink/i);
  assert.deepEqual(stderr, []);

  const failureStdout: string[] = [];
  const failureStderr: string[] = [];
  let serviceCalls = 0;
  const failureCode = await runScriptMain([], {
    generateEmergencyLoginCode: async () => {
      serviceCalls += 1;
      return { ok: false, error: "should not run" };
    },
    stdout: (value) => failureStdout.push(value),
    stderr: (value) => failureStderr.push(value)
  });
  assert.equal(failureCode, 1);
  assert.equal(serviceCalls, 0);
  assert.deepEqual(failureStdout, []);
  assert.match(failureStderr.at(-1) ?? "", /--email is required/);
  assert.match(failureStderr.at(-1) ?? "", new RegExp(CREATE_EMERGENCY_LOGIN_CODE_USAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("operator script delegates to the canonical emergency service and never implements links or invite codes", () => {
  const script = readFileSync(
    path.join(process.cwd(), "scripts/create-emergency-login-code.ts"),
    "utf8"
  );
  const service = readFileSync(path.join(process.cwd(), "lib/server/emergency-login-code.ts"), "utf8");

  assert.match(script, /generateEmergencyLoginCodeForOperatorByEmail/);
  assert.doesNotMatch(script, /generateLink|email_otp|action_link|invite_codes|createInviteCode/);
  assert.match(service, /generateEmergencyLoginCodeForOperatorByEmail/);
  assert.match(service, /generateEmergencyLoginCodeForUserWithActor/);
  assert.match(service, /method:\s*input\.method/);
  assert.match(service, /properties\?\.email_otp/);
});
