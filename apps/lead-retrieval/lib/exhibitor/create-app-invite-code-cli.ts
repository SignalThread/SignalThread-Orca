import type { CompanyTeamActionState } from "@/lib/exhibitor/company-team-types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateAppInviteCodeCliArgs = {
  email: string;
  companyId: string;
  eventId: string;
  dryRun: boolean;
};

export type CreateAppInviteCodeCliContext = CreateAppInviteCodeCliArgs & {
  companyName: string;
  eventName: string;
};

type ContextResolverDeps = {
  loadCompany: (companyId: string) => Promise<{ id: string; name: string | null } | null>;
  loadEvent: (eventId: string) => Promise<{ id: string; name: string | null; companyId: string | null } | null>;
  hasExhibitorAssignment: (companyId: string, eventId: string) => Promise<boolean>;
};

type RunDeps = ContextResolverDeps & {
  createInvite: (context: CreateAppInviteCodeCliContext) => Promise<CompanyTeamActionState>;
};

function readFlagValue(argv: string[], index: number, name: string): { value: string; consumed: number } {
  const arg = argv[index] ?? "";
  const inlinePrefix = `${name}=`;
  if (arg.startsWith(inlinePrefix)) {
    return { value: arg.slice(inlinePrefix.length), consumed: 1 };
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return { value, consumed: 2 };
}

export function parseCreateAppInviteCodeArgs(argv: string[]): CreateAppInviteCodeCliArgs {
  const values: Partial<CreateAppInviteCodeCliArgs> = { dryRun: false };
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; ) {
    const arg = argv[index] ?? "";
    if (arg === "--dry-run") {
      if (seen.has("--dry-run")) throw new Error("--dry-run may only be provided once.");
      seen.add("--dry-run");
      values.dryRun = true;
      index += 1;
      continue;
    }

    const name = ["--email", "--company-id", "--event-id"].find(
      (candidate) => arg === candidate || arg.startsWith(`${candidate}=`)
    );
    if (!name) throw new Error(`Unknown argument: ${arg || "(empty)"}.`);
    if (seen.has(name)) throw new Error(`${name} may only be provided once.`);
    seen.add(name);
    const parsed = readFlagValue(argv, index, name);
    const value = parsed.value.trim();
    if (name === "--email") values.email = value.toLowerCase();
    if (name === "--company-id") values.companyId = value;
    if (name === "--event-id") values.eventId = value;
    index += parsed.consumed;
  }

  if (!values.email) throw new Error("--email is required.");
  if (!EMAIL_PATTERN.test(values.email)) throw new Error("--email must be a valid email address.");
  if (!values.companyId) throw new Error("--company-id is required.");
  if (!UUID_PATTERN.test(values.companyId)) throw new Error("--company-id must be a UUID.");
  if (!values.eventId) throw new Error("--event-id is required.");
  if (!UUID_PATTERN.test(values.eventId)) throw new Error("--event-id must be a UUID.");

  return values as CreateAppInviteCodeCliArgs;
}

export async function resolveCreateAppInviteCodeContext(
  args: CreateAppInviteCodeCliArgs,
  deps: ContextResolverDeps
): Promise<CreateAppInviteCodeCliContext> {
  const [company, event] = await Promise.all([
    deps.loadCompany(args.companyId),
    deps.loadEvent(args.eventId)
  ]);
  if (!company || String(company.id) !== args.companyId) {
    throw new Error("Company was not found.");
  }
  if (!event || String(event.id) !== args.eventId) {
    throw new Error("Event was not found.");
  }

  const eventOwnerCompanyId = String(event.companyId ?? "").trim();
  const associated =
    eventOwnerCompanyId === args.companyId ||
    (await deps.hasExhibitorAssignment(args.companyId, args.eventId));
  if (!associated) {
    throw new Error("Event is not associated with the specified company.");
  }

  return {
    ...args,
    companyName: String(company.name ?? "Company"),
    eventName: String(event.name ?? "Event")
  };
}

export async function runCreateAppInviteCodeCli(
  args: CreateAppInviteCodeCliArgs,
  deps: RunDeps
): Promise<{ context: CreateAppInviteCodeCliContext; code: string | null }> {
  const context = await resolveCreateAppInviteCodeContext(args, deps);
  if (args.dryRun) return { context, code: null };

  const result = await deps.createInvite(context);
  if (!result.ok) throw new Error(result.error);
  const codes = result.appInviteCodes ?? [];
  if (codes.length !== 1 || codes[0]?.eventId !== context.eventId || !/^\d{6}$/.test(codes[0]?.code ?? "")) {
    throw new Error("Canonical invite service did not return exactly one 6-digit code for the requested event.");
  }
  return { context, code: codes[0].code };
}
