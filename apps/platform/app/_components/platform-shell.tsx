import Image from "next/image";
import Link from "next/link";

/**
 * The authenticated Platform chrome: SignalThread identity, organization
 * context, account, sign out. One implementation, rendered by every
 * authenticated layout so the shell reads identically across routes.
 */
export type ShellOrganization = { name: string; role?: string | null };

export function PlatformShell({
  email,
  organization,
  organizationCount,
  admin = false,
  children,
}: {
  email: string | null;
  /** The organization in context, when a single one is. */
  organization?: ShellOrganization | null;
  /** How many organizations the user can reach, for the label when none is selected. */
  organizationCount?: number;
  admin?: boolean;
  children: React.ReactNode;
}) {
  const orgLabel = organization
    ? organization.name
    : organizationCount === undefined
      ? null
      : organizationCount === 1
        ? null
        : `${organizationCount} organizations`;

  return (
    <div className="min-h-screen">
      <header
        className="h-16 border-b"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-card)" }}
      >
        <div className="mx-auto flex h-full w-full max-w-[1280px] items-center gap-4 px-5 sm:gap-[22px] sm:px-10">
          <Link href="/home" aria-label="SignalThread home" className="flex shrink-0 items-center">
            <Image
              src="/brand/signalthread-logo.png"
              alt="SignalThread"
              width={1237}
              height={377}
              priority
              className="h-[22px] w-auto"
            />
          </Link>

          {orgLabel ? (
            <>
              <span aria-hidden className="hidden h-7 w-px sm:block" style={{ background: "var(--border-subtle)" }} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="st-eyebrow" style={{ color: "var(--text-subtle)" }}>
                  Organization
                </span>
                <span className="truncate text-[13px] leading-4 font-medium" style={{ color: "var(--text-heading)" }}>
                  {orgLabel}
                </span>
              </div>
            </>
          ) : null}

          <nav aria-label="Platform" className="ml-2 hidden items-center gap-1 md:flex">
            <Link
              href="/events"
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium hover:bg-slate-100"
              style={{ color: "var(--text-body)" }}
            >
              Events
            </Link>
            {admin ? (
              <Link
                href="/admin"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium hover:bg-slate-100"
                style={{ color: "var(--text-body)" }}
              >
                Admin
              </Link>
            ) : null}
          </nav>

          <div className="hidden flex-1 sm:block" />

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden text-xs md:inline" style={{ color: "var(--text-muted)" }}>
              {email}
            </span>
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: "#e2e8f0", color: "#334155" }}
            >
              {initialsFor(email)}
            </span>
            {/* A form POST, so no prefetch or embedded resource can trigger sign-out. */}
            <form action="/signout" method="post">
              <button
                type="submit"
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-body)" }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-5 pt-7 pb-16 sm:px-10">{children}</main>
    </div>
  );
}

/** Two-letter avatar text from an email's local part; a neutral glyph when absent. */
export function initialsFor(email: string | null | undefined): string {
  if (!email) return "·";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase();
}
