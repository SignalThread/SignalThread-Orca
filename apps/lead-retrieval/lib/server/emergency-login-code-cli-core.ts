import type { EmergencyLoginCodeResult } from "@/lib/server/emergency-login-code-core";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CREATE_EMERGENCY_LOGIN_CODE_USAGE =
  "npx tsx --conditions=react-server scripts/create-emergency-login-code.ts --email user@example.com";
export const EMERGENCY_LOGIN_CLI_METHOD = "operator_cli_email";
export const EMERGENCY_LOGIN_CLI_REASON = "Emergency support operator CLI fallback.";

export type CreateEmergencyLoginCodeArgs = {
  email: string;
};

export type EmergencyLoginEmailCandidate = {
  id: string;
  email: string | null;
  role: string | null;
  companyId: string | null;
  companyName: string | null;
  membershipCompanies?: Array<{ id: string; name: string | null }>;
};

type EmergencyLoginCliDeps = {
  generateEmergencyLoginCode: (input: {
    email: string;
    reason: string;
    method: string;
  }) => Promise<EmergencyLoginCodeResult>;
};

type EmergencyLoginCliIo = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

function readEmailArg(argv: string[], index: number): { value: string; consumed: number } {
  const arg = argv[index] ?? "";
  if (arg.startsWith("--email=")) {
    return { value: arg.slice("--email=".length), consumed: 1 };
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--email requires a value.");
  }
  return { value, consumed: 2 };
}

export function normalizeEmergencyLoginEmail(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

export function parseCreateEmergencyLoginCodeArgs(argv: string[]): CreateEmergencyLoginCodeArgs {
  let email: string | null = null;

  for (let index = 0; index < argv.length; ) {
    const arg = argv[index] ?? "";
    if (arg !== "--email" && !arg.startsWith("--email=")) {
      throw new Error(`Unknown argument: ${arg || "(empty)"}.`);
    }
    if (email !== null) {
      throw new Error("--email may only be provided once.");
    }
    const parsed = readEmailArg(argv, index);
    email = normalizeEmergencyLoginEmail(parsed.value);
    index += parsed.consumed;
  }

  if (!email) throw new Error("--email is required.");
  if (!EMAIL_PATTERN.test(email)) throw new Error("--email must be a valid email address.");
  return { email };
}

function candidateContext(candidate: EmergencyLoginEmailCandidate): string {
  const company = String(candidate.companyName ?? "").trim() || "Unknown company";
  const companyId = String(candidate.companyId ?? "").trim() || "no company id";
  const role = String(candidate.role ?? "").trim() || "unknown role";
  return `- ${company} (${companyId}) · ${role} · user ${candidate.id}`;
}

export function resolveEmergencyLoginTargetByEmail(
  email: string,
  candidates: EmergencyLoginEmailCandidate[]
): EmergencyLoginEmailCandidate {
  const normalizedEmail = normalizeEmergencyLoginEmail(email);
  const exact = candidates.filter(
    (candidate) => normalizeEmergencyLoginEmail(candidate.email ?? "") === normalizedEmail
  );

  if (exact.length === 0) {
    throw new Error(`No LR user was found for ${normalizedEmail}.`);
  }
  if (exact.length > 1) {
    const context = exact.map(candidateContext).join("\n");
    throw new Error(
      `Multiple LR users match ${normalizedEmail}; refusing to guess.\n${context}\nResolve the account ambiguity before retrying.`
    );
  }
  const target = exact[0]!;
  const companyScopes = new Map<string, string>();
  const canonicalCompanyId = String(target.companyId ?? "").trim();
  if (canonicalCompanyId) {
    companyScopes.set(canonicalCompanyId, String(target.companyName ?? "").trim() || "Unknown company");
  }
  for (const company of target.membershipCompanies ?? []) {
    const companyId = String(company.id ?? "").trim();
    if (!companyId) continue;
    companyScopes.set(companyId, String(company.name ?? "").trim() || "Unknown company");
  }
  if (companyScopes.size > 1) {
    const context = [...companyScopes.entries()]
      .map(([companyId, companyName]) => `- ${companyName} (${companyId})`)
      .join("\n");
    throw new Error(
      `${normalizedEmail} has access records in multiple company scopes; refusing to guess.\n${context}\nResolve the account ambiguity before retrying.`
    );
  }
  return target;
}

export async function runCreateEmergencyLoginCodeCli(
  argv: string[],
  deps: EmergencyLoginCliDeps
): Promise<{ email: string; code: string }> {
  const args = parseCreateEmergencyLoginCodeArgs(argv);
  const result = await deps.generateEmergencyLoginCode({
    email: args.email,
    reason: EMERGENCY_LOGIN_CLI_REASON,
    method: EMERGENCY_LOGIN_CLI_METHOD
  });

  if (!result.ok) throw new Error(result.error);
  const returnedEmail = normalizeEmergencyLoginEmail(result.targetEmail);
  const code = String(result.loginCode.code ?? "").trim();
  if (returnedEmail !== args.email) {
    throw new Error("Canonical emergency-login service returned a different target email.");
  }
  if (result.loginCode.verificationType !== "email" || !/^\d{6,12}$/.test(code)) {
    throw new Error("Canonical emergency-login service did not return a valid email OTP.");
  }

  return { email: returnedEmail, code };
}

export async function runCreateEmergencyLoginCodeCommand(
  argv: string[],
  deps: EmergencyLoginCliDeps,
  io: EmergencyLoginCliIo
): Promise<number> {
  try {
    const result = await runCreateEmergencyLoginCodeCli(argv, deps);
    io.stdout(`Emergency Login Code\nEmail: ${result.email}\nCode: ${result.code}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Emergency Login Code generation failed.";
    io.stderr(`${message}\n\nUsage:\n  ${CREATE_EMERGENCY_LOGIN_CODE_USAGE}`);
    return 1;
  }
}
