import { SignInForm } from "./signin-form";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  auth_not_configured:
    "Platform Core authentication is not configured for this deployment. Set the Platform Core Supabase URL and anon key.",
  missing_code: "That sign-in link was incomplete. Request a new one.",
  exchange_failed: "That sign-in link has expired or was already used. Request a new one.",
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;

  // Only same-origin relative paths survive, so ?next= cannot be used to bounce a
  // freshly authenticated user to an attacker's site.
  const requested = firstValue(params.next);
  const nextPath =
    requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/home";

  const errorKey = firstValue(params.error);
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? null : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <section
        className="w-full space-y-6 rounded-2xl border p-8 shadow-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <header className="space-y-1.5">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--signalthread-ink)" }}>
            SignalThread
          </h1>
          <p className="text-sm" style={{ color: "var(--signalthread-muted)" }}>
            Sign in to reach your organizations, events, and products.
          </p>
        </header>

        {errorMessage ? (
          <p role="alert" className="text-sm" style={{ color: "#b91c1c" }}>
            {errorMessage}
          </p>
        ) : null}

        <SignInForm nextPath={nextPath} />
      </section>
    </main>
  );
}
