/**
 * Provision a controlled test identity in SignalThread Platform Core.
 *
 * Platform Core is canonical for identity, organization ids, event ids and product
 * entitlements. This script performs the **minimum correct Platform-owned provisioning**
 * needed to exercise the Platform → Orca handoff, using the only canonical mechanism that
 * Platform Core actually exposes today: Supabase Auth (GoTrue) plus server-controlled
 * `app_metadata` claims.
 *
 * ## Why app_metadata rather than Platform tables
 *
 * Platform Core's `public` schema currently contains **no tables** — no organizations,
 * events, memberships or entitlements registry. `app_metadata` is server-controlled (only a
 * service-role key can write it), is signed into the user's JWT, and is therefore verifiable
 * by Orca without querying Platform Core's database. Designing Platform Core's relational
 * data model is Platform product work and is deliberately NOT done here.
 *
 * ## Claim contract written by this script
 *
 * ```jsonc
 * app_metadata.signalthread = {
 *   "products":      ["orca"],        // product entitlement — Orca fails closed without it
 *   "organizations": ["<uuid>"],      // canonical organization ids the user may access
 *   "events":        ["<uuid>"]       // provisioning record of minted canonical event ids
 * }
 * ```
 *
 * `organizations` is authorization input: Orca intersects it with local product access.
 * `events` is a **provisioning record only** — Orca never authorizes from it, because a
 * per-event claim list does not scale. Orca authorizes an event by checking that the event's
 * organization is Platform-authorized and that the user holds an Orca `EventMember` row.
 *
 * ## Safety
 *
 * - Idempotent: re-running reuses the existing user and preserves already-minted ids.
 * - Never invents ids for objects that already exist.
 * - Writes only to the Platform Core project ref named below, and refuses any other target.
 * - Prints no secrets. The generated password is written to `--password-out` (a path you
 *   control) and never echoed.
 *
 * Usage:
 *   npx tsx scripts/platform-provision-test-identity.ts \
 *     --email <address> --password-out <path> [--ids-out <path>] [--commit]
 *
 * Without `--commit` it performs a dry run and writes nothing.
 */

import { config as loadEnv } from "dotenv";

// Match the app: .env.local first, then .env. Never committed.
loadEnv({ path: ".env.local" });
loadEnv();

import { randomUUID, randomBytes } from "node:crypto";
import { writeFileSync, chmodSync } from "node:fs";

const PLATFORM_CORE_REF = "wtbnpeluwhjjqccdofxd";
const CLAIMS_NAMESPACE = "signalthread";
const ORCA_PRODUCT_KEY = "orca";

type Args = {
  email: string;
  passwordOut: string;
  idsOut: string | null;
  commit: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : null;
  };
  const email = get("--email");
  const passwordOut = get("--password-out");
  if (!email) throw new Error("--email is required");
  if (!passwordOut) throw new Error("--password-out is required (the password is never printed)");
  return { email, passwordOut, idsOut: get("--ids-out"), commit: argv.includes("--commit") };
}

function requirePlatformCoreConfig(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL is required.");
  if (!serviceRoleKey) throw new Error("PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY is required.");
  if (!url.includes(PLATFORM_CORE_REF)) {
    throw new Error(
      `Refusing to run: the configured Supabase URL is not the Platform Core project (${PLATFORM_CORE_REF}).`,
    );
  }
  return { url, serviceRoleKey };
}

async function gotrue<T>(
  cfg: { url: string; serviceRoleKey: string },
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${cfg.url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Platform Core ${path} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

type PlatformUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};

async function findUserByEmail(
  cfg: { url: string; serviceRoleKey: string },
  email: string,
): Promise<PlatformUser | null> {
  const normalized = email.trim().toLowerCase();
  const page = await gotrue<{ users?: PlatformUser[] }>(cfg, `/admin/users?per_page=200`);
  const users = page.users ?? [];
  return users.find((u) => (u.email ?? "").toLowerCase() === normalized) ?? null;
}

function readExistingClaims(user: PlatformUser | null): {
  products: string[];
  organizations: string[];
  events: string[];
} {
  const ns = (user?.app_metadata?.[CLAIMS_NAMESPACE] ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    products: arr(ns.products),
    organizations: arr(ns.organizations),
    events: arr(ns.events),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const cfg = requirePlatformCoreConfig();

  console.info(`[platform] target project ref : ${PLATFORM_CORE_REF}`);
  console.info(`[platform] mode               : ${args.commit ? "COMMIT" : "DRY RUN"}`);

  const existing = await findUserByEmail(cfg, args.email);
  const existingClaims = readExistingClaims(existing);

  // Reuse whatever Platform already minted; only mint what is genuinely absent.
  const organizationId = existingClaims.organizations[0] ?? randomUUID();
  const eventId = existingClaims.events[0] ?? randomUUID();
  const products = Array.from(new Set([...existingClaims.products, ORCA_PRODUCT_KEY]));

  console.info(`[platform] existing user      : ${existing ? existing.id : "none (will create)"}`);
  console.info(`[platform] organization_id    : ${organizationId}${existingClaims.organizations[0] ? " (existing)" : " (newly minted)"}`);
  console.info(`[platform] event_id           : ${eventId}${existingClaims.events[0] ? " (existing)" : " (newly minted)"}`);
  console.info(`[platform] products           : ${products.join(", ")}`);

  if (!args.commit) {
    console.info("[platform] dry run complete — nothing was written. Re-run with --commit.");
    return;
  }

  const appMetadata = {
    ...(existing?.app_metadata ?? {}),
    [CLAIMS_NAMESPACE]: { products, organizations: [organizationId], events: [eventId] },
  };

  let userId: string;
  let password: string | null = null;

  if (existing) {
    // Rotate the password so the caller always ends up with a usable credential,
    // without ever reading the old one.
    password = randomBytes(24).toString("base64url");
    const updated = await gotrue<PlatformUser>(cfg, `/admin/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password, app_metadata: appMetadata, email_confirm: true }),
    });
    userId = updated.id;
    console.info("[platform] updated existing user (claims + password rotated)");
  } else {
    password = randomBytes(24).toString("base64url");
    const created = await gotrue<PlatformUser>(cfg, `/admin/users`, {
      method: "POST",
      body: JSON.stringify({
        email: args.email,
        password,
        email_confirm: true,
        app_metadata: appMetadata,
      }),
    });
    userId = created.id;
    console.info("[platform] created new Platform Core user");
  }

  console.info(`[platform] user_id            : ${userId}`);

  writeFileSync(args.passwordOut, password ?? "", { mode: 0o600 });
  chmodSync(args.passwordOut, 0o600);
  console.info(`[platform] password written to ${args.passwordOut} (not printed)`);

  if (args.idsOut) {
    const ids = { platformUserId: userId, organizationId, eventId, email: args.email, products };
    writeFileSync(args.idsOut, JSON.stringify(ids, null, 2), { mode: 0o600 });
    console.info(`[platform] canonical ids written to ${args.idsOut}`);
  }

  console.info("[platform] done. These ids are canonical: adopt them directly in Orca.");
}

main().catch((error) => {
  console.error("[platform] provisioning failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
