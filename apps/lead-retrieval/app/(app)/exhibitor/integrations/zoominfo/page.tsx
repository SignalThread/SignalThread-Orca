import type { ReactNode } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { ZoomInfoConfigFlashBanner } from "@/components/exhibitor/zoominfo-config-flash-banner";
import { ZoomInfoSettingsClient } from "@/components/exhibitor/zoominfo-settings-client";
import { getZoomInfoConnectionForCompany, toZoomInfoPublicStatus } from "@/lib/server/integrations/zoominfo";

function formatTimestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function searchFlag(sp: Record<string, string | string[] | undefined>, key: string): boolean {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s === "1" || s === "true";
}

type BannerSpec = {
  variant: "success" | "warning" | "error";
  title: string;
  body: string;
  dismissable: boolean;
};

function resolveZoomInfoStatusBanner(input: {
  sp: Record<string, string | string[] | undefined>;
  loadError: { message: string } | null;
  pub: ReturnType<typeof toZoomInfoPublicStatus>;
}): BannerSpec | null {
  const { sp, loadError, pub } = input;

  const tokenSavedFlash = searchFlag(sp, "token_saved");

  if (tokenSavedFlash) {
    return {
      variant: "success",
      title: "Token saved",
      body: "Your ZoomInfo bearer token was validated and stored. Use Validate connection anytime to re-check.",
      dismissable: true,
    };
  }

  if (loadError) {
    return {
      variant: "error",
      title: "Could not load ZoomInfo",
      body: loadError.message,
      dismissable: false,
    };
  }

  if (pub.invalidToken) {
    return {
      variant: "error",
      title: "Invalid token",
      body: "The saved token failed validation against ZoomInfo. Edit the token or run Validate connection after updating it in ZoomInfo.",
      dismissable: false,
    };
  }

  return null;
}

export default async function ExhibitorZoomInfoIntegrationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const accountId = sessionUser.company_id;
  const sp = (await searchParams) ?? {};

  if (!accountId) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">ZoomInfo</h1>
            <p className="mt-0.5 text-sm text-slate-600">
              Add your organization&apos;s ZoomInfo API bearer token for enrichment and pre-show intelligence.
            </p>
          </div>
          <Link
            href="/exhibitor/integrations"
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Integrations
          </Link>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          Your exhibitor admin user is not linked to an account, so this integration cannot be configured.
        </div>
      </section>
    );
  }

  const { row, error: loadError } = await getZoomInfoConnectionForCompany(accountId);
  const pub = toZoomInfoPublicStatus(loadError ? null : row);
  const lastUpdatedLabel = formatTimestamp(row?.updated_at ?? null);

  const bannerSpec = resolveZoomInfoStatusBanner({
    sp,
    loadError: loadError ? { message: loadError.message } : null,
    pub,
  });

  let statusBanner: ReactNode = null;
  if (bannerSpec) {
    statusBanner = (
      <ZoomInfoConfigFlashBanner
        variant={bannerSpec.variant}
        title={bannerSpec.title}
        body={bannerSpec.body}
        dismissable={bannerSpec.dismissable}
      />
    );
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">ZoomInfo</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Add your organization&apos;s ZoomInfo API bearer token for enrichment and pre-show intelligence.
          </p>
        </div>
        <Link
          href="/exhibitor/integrations"
          className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to Integrations
        </Link>
      </div>

      {statusBanner}

      <ZoomInfoSettingsClient initialPublic={pub} lastUpdatedLabel={lastUpdatedLabel} />
    </section>
  );
}
