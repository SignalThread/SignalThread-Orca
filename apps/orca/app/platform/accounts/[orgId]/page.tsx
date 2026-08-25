import Link from "next/link";
import { PageHeader } from "@signalthread/ui";
import { PlatformAccountsClient } from "../../_components/platform-accounts-client";
import { AccountDeleteWorkflow } from "../../_components/account-delete-workflow";

export default async function PlatformAccountDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Account"
        title="Account detail"
        description="Inspect account setup, membership, event access, and platform context controls."
        actions={
          <Link
            href="/platform/accounts"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to Accounts
          </Link>
        }
      />
      <PlatformAccountsClient mode="detail" orgId={orgId} />
      <AccountDeleteWorkflow orgId={orgId} />
    </div>
  );
}
