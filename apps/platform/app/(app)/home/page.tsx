import Link from "next/link";
import { createPlatformServerClient } from "@/lib/supabase/server";
import { getLauncherData } from "@/lib/server/launcher";
import { isPlatformAdmin } from "@/lib/server/registry";

export const dynamic = "force-dynamic";

/**
 * The Platform front door.
 *
 * Answers "what can I reach?" — organizations, their events, and which products
 * are enabled — and hands off to a product without asking the user to pick the
 * event again on the far side.
 */
export default async function HomePage() {
  const supabase = await createPlatformServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [organizations, admin] = await Promise.all([
    getLauncherData(user.id),
    isPlatformAdmin(user.id),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold" style={{ color: "var(--signalthread-ink)" }}>
            Welcome back
          </h1>
          <p className="text-sm" style={{ color: "var(--signalthread-muted)" }}>
            Signed in as {user.email}
          </p>
        </div>
        {admin ? (
          <Link
            href="/admin"
            className="rounded-md border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--border)" }}
          >
            Platform admin
          </Link>
        ) : null}
      </header>

      {organizations.length === 0 ? (
        <section
          className="rounded-xl border p-6 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p style={{ color: "var(--signalthread-muted)" }}>
            This account is not a member of any organization yet. A Platform admin can add you.
          </p>
        </section>
      ) : null}

      {organizations.map((organization) => (
        <section key={organization.organizationId} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold" style={{ color: "var(--signalthread-ink)" }}>
              {organization.organizationName}
            </h2>
            <span className="text-xs" style={{ color: "var(--signalthread-muted)" }}>
              {organization.organizationRole}
              {organization.products.length > 0
                ? ` · ${organization.products.join(", ")}`
                : " · no products enabled"}
            </span>
          </div>

          {organization.events.length === 0 ? (
            <p
              className="rounded-xl border p-4 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--signalthread-muted)" }}
            >
              No active events in this organization yet.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {organization.events.map((event) => (
                <li
                  key={event.id}
                  className="space-y-3 rounded-xl border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium" style={{ color: "var(--signalthread-ink)" }}>
                      {event.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--signalthread-muted)" }}>
                      {event.slug} · {event.status}
                    </p>
                  </div>

                  {event.products.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--signalthread-muted)" }}>
                      No products enabled for this organization.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {event.products.map((product) =>
                        product.href ? (
                          <a
                            key={product.productKey}
                            href={product.href}
                            data-testid={`open-${product.productKey}`}
                            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                            style={{ background: "var(--signalthread-accent)" }}
                          >
                            Open {product.productName}
                          </a>
                        ) : (
                          <span
                            key={product.productKey}
                            className="rounded-md border px-3 py-1.5 text-xs"
                            style={{ borderColor: "var(--border)", color: "var(--signalthread-muted)" }}
                          >
                            {product.productName} — not deployed
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
