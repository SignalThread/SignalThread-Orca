import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSendGridConfig, SendGridEmailProvider } from "@/src/server/email/sendgrid-provider";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(webDir, "..");

function loadLocalEnvFiles(): void {
  const envPaths = [
    path.join(repoRoot, ".env.local"),
    path.join(webDir, ".env.local"),
    path.join(repoRoot, ".env"),
    path.join(webDir, ".env"),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      loadEnv({ path: envPath });
    }
  }
}

loadLocalEnvFiles();

const RECIPIENT_ENV = "MARKETING_EMAIL_SMOKE_TEST_TO";

function timestampToken(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function main(): Promise<void> {
  const config = readSendGridConfig();
  const to = process.env[RECIPIENT_ENV]?.trim();

  if (!config) {
    console.log(
      "[marketing-email-smoke] Skipped: outbound SendGrid is not configured. Set SENDGRID_API_KEY and EMAIL_FROM to run this smoke test.",
    );
    process.exitCode = 0;
    return;
  }

  if (!to) {
    console.log(
      `[marketing-email-smoke] Skipped: ${RECIPIENT_ENV} is not configured. Set it to a controlled recipient before running this smoke test.`,
    );
    process.exitCode = 0;
    return;
  }

  const runAt = new Date();
  const runId = timestampToken(runAt);
  const subject = `Planner OS marketing smoke test - ${runId}`;
  const body = [
    "This is an automated Planner OS Marketing smoke test.",
    "",
    `Run id: ${runId}`,
    `Sent at: ${runAt.toISOString()}`,
    "",
    "If you received this, the configured SendGrid provider accepted a real outbound message.",
  ].join("\n");

  const provider = new SendGridEmailProvider(config);
  const result = await provider.send({ to, subject, body });

  if (result.status !== "SENT") {
    console.error(
      `[marketing-email-smoke] Failed: SendGrid did not accept the smoke email.${result.detail ? ` ${result.detail}` : ""}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `[marketing-email-smoke] Sent one real smoke email to ${to}. Subject: "${subject}".${result.detail ? ` Message id: ${result.detail}` : ""}`,
  );
}

void main();
