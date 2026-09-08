import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_SEEDED_AUTH_EMAILS_CANONICAL } from "../../lib/e2e/e2e-seeded-auth-emails";

export const PROD_CANARY_FLAG = "RUN_PROD_CANARIES";
export const CANARY_COMPANY_NAME = "Canary";
export const CANARY_EVENT_NAME = "Canary";
export const CANARY_MARKER = "CANARY_DO_NOT_DELETE";
export const DEFAULT_CANARY_R2_PREFIX = "canaries/lead-retrieval/";

export type CanaryResourceIds = {
  companyId: string;
  eventId: string;
  exhibitorUserId: string;
  testEmail: string;
  r2Prefix: string;
};

type AppUser = {
  id: string;
  email: string | null;
  role: string;
};

export function assertProdCanariesEnabled(env: Record<string, string | undefined> = process.env) {
  if (env[PROD_CANARY_FLAG] !== "1") {
    throw new Error(`Refusing to run production canaries. Set ${PROD_CANARY_FLAG}=1 to opt in.`);
  }
}

export function requireEnv(name: string, env: Record<string, string | undefined> = process.env) {
  const value = String(env[name] ?? "").trim();
  if (!value) {
    throw new Error(`${name} is required for production canaries.`);
  }
  return value;
}

export function requireCanaryTestEmail(env: Record<string, string | undefined> = process.env) {
  const email = requireEnv("CANARY_TEST_EMAIL", env).toLowerCase();
  if (!email.includes("@")) {
    throw new Error("CANARY_TEST_EMAIL must be an email address.");
  }
  return email;
}

export function getCanaryR2Prefix(env: Record<string, string | undefined> = process.env) {
  const raw = String(env.CANARY_R2_PREFIX ?? DEFAULT_CANARY_R2_PREFIX).trim() || DEFAULT_CANARY_R2_PREFIX;
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function requireSupabaseUrl(env: Record<string, string | undefined> = process.env) {
  return String(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim() || requireEnv("SUPABASE_URL", env);
}

export function createCanarySupabaseClient(env: Record<string, string | undefined> = process.env) {
  return createClient(requireSupabaseUrl(env), requireEnv("SUPABASE_SERVICE_ROLE_KEY", env), {
    auth: { persistSession: false }
  });
}

export function canaryObjectKey(prefix = getCanaryR2Prefix()) {
  return `${prefix}${CANARY_MARKER}-${Date.now()}-${randomUUID()}.txt`;
}

export function canaryRunLabel(name: string) {
  return `${CANARY_MARKER}_${name}_${new Date().toISOString()}`;
}

export function printCanaryResources(resources: CanaryResourceIds) {
  console.log(`CANARY_COMPANY_ID=${resources.companyId}`);
  console.log(`CANARY_EVENT_ID=${resources.eventId}`);
  console.log(`CANARY_EXHIBITOR_USER_ID=${resources.exhibitorUserId}`);
  console.log(`CANARY_TEST_EMAIL=${resources.testEmail}`);
  console.log(`CANARY_R2_PREFIX=${resources.r2Prefix}`);
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function seededEmailCandidates() {
  return [...new Set(E2E_SEEDED_AUTH_EMAILS_CANONICAL.flatMap((email) => [email, email.toLowerCase()]))];
}

function pickExhibitorUser(users: AppUser[]) {
  const byEmail = new Map(users.map((user) => [normalizeEmail(user.email), user]));
  const preferred = byEmail.get("playwright-ea@test.com") ?? byEmail.get("kamyab.ali+ex@gmail.com");
  if (preferred) return preferred;
  const exhibitor = users.find((user) => /exhibitor/.test(user.role));
  if (exhibitor) return exhibitor;
  throw new Error(
    `No seeded exhibitor user found. Expected one of: ${E2E_SEEDED_AUTH_EMAILS_CANONICAL.join(", ")}.`
  );
}

function pickOrganizerUser(users: AppUser[], fallback: AppUser) {
  const byEmail = new Map(users.map((user) => [normalizeEmail(user.email), user]));
  return (
    byEmail.get("playwright-oa@test.com") ??
    users.find((user) => /organizer|platform/.test(user.role)) ??
    fallback
  );
}

async function loadSeededUsers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("users")
    .select("id,email,role")
    .in("email", seededEmailCandidates());
  if (error) throw new Error(`Failed loading seeded canary users: ${error.message}`);
  const users = (data ?? []) as AppUser[];
  if (users.length === 0) {
    throw new Error(`No seeded test users found. Expected one of: ${E2E_SEEDED_AUTH_EMAILS_CANONICAL.join(", ")}.`);
  }
  return users;
}

async function findOrCreateCanaryCompany(supabase: SupabaseClient, organizerUserId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("companies")
    .select("id")
    .eq("name", CANARY_COMPANY_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Failed loading Canary company: ${existingError.message}`);
  if (existing?.id) return String(existing.id);

  const { data: inserted, error: insertError } = await supabase
    .from("companies")
    .insert({
      name: CANARY_COMPANY_NAME,
      organizer_id: organizerUserId
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`Failed creating Canary company: ${insertError.message}`);
  return String(inserted.id);
}

async function findOrCreateCanaryEvent(supabase: SupabaseClient, companyId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("events")
    .select("id")
    .eq("name", CANARY_EVENT_NAME)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Failed loading Canary event: ${existingError.message}`);
  if (existing?.id) return String(existing.id);

  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 30);

  const { data: inserted, error: insertError } = await supabase
    .from("events")
    .insert({
      name: CANARY_EVENT_NAME,
      company_id: companyId,
      city: "Canary",
      state: "CA",
      location: "Canary",
      start_date: now.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      status: "ACTIVE",
      is_active: true,
      container_kind: "event"
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`Failed creating Canary event: ${insertError.message}`);
  return String(inserted.id);
}

async function ensureCanaryEventMembership(input: {
  supabase: SupabaseClient;
  eventId: string;
  companyId: string;
  exhibitorUserId: string;
}) {
  const permissions = {
    app: true,
    admin: true,
    lead_capture: true,
    can_manage_leads: true,
    can_manage_campaigns: true
  };

  const { error } = await input.supabase
    .from("event_users")
    .upsert(
      {
        user_id: input.exhibitorUserId,
        event_id: input.eventId,
        exhibitor_company_id: input.companyId,
        status: "active",
        permissions
      },
      { onConflict: "user_id,event_id" }
    );
  if (error) throw new Error(`Failed ensuring Canary event membership: ${error.message}`);
}

export async function setupCanaryResources(env: Record<string, string | undefined> = process.env) {
  assertProdCanariesEnabled(env);
  const testEmail = requireCanaryTestEmail(env);
  const r2Prefix = getCanaryR2Prefix(env);
  const supabase = createCanarySupabaseClient(env);
  const seededUsers = await loadSeededUsers(supabase);
  const exhibitor = pickExhibitorUser(seededUsers);
  const organizer = pickOrganizerUser(seededUsers, exhibitor);
  const companyId = await findOrCreateCanaryCompany(supabase, organizer.id);
  const eventId = await findOrCreateCanaryEvent(supabase, companyId);

  await ensureCanaryEventMembership({
    supabase,
    eventId,
    companyId,
    exhibitorUserId: exhibitor.id
  });

  return {
    companyId,
    eventId,
    exhibitorUserId: exhibitor.id,
    testEmail,
    r2Prefix
  } satisfies CanaryResourceIds;
}
