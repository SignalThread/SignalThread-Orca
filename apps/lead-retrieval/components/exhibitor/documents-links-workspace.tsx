import Link from "next/link";
import { FileText, Mail } from "lucide-react";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { ExhibitorDocumentsHub } from "@/components/exhibitor/documents-hub-client";
import { ExhibitorEmailTemplatesClient } from "@/components/exhibitor/email-templates-client";

export type DocumentsLinksTab = "resources" | "email-templates";

const TABS: ReadonlyArray<{
  id: DocumentsLinksTab;
  label: string;
  href: string;
  icon: typeof FileText;
}> = [
  { id: "resources", label: "Resources", href: "/exhibitor/documents", icon: FileText },
  { id: "email-templates", label: "Email Templates", href: "/exhibitor/documents?tab=email-templates", icon: Mail },
];

export function DocumentsLinksWorkspace({
  activeTab,
  googleWorkspace,
}: {
  activeTab: DocumentsLinksTab;
  googleWorkspace: { ready: boolean; senderEmail: string | null };
}) {
  const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? "Resources";

  return (
    <PageShell>
      <PageHeader
        title="Documents & Links"
        subtitle="Manage sales collateral, marketing assets, and the templates your team uses to send them."
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <nav
          aria-label="Documents and links sections"
          className="flex items-center gap-1 border-b border-slate-200 px-4"
          role="tablist"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                role="tab"
                aria-selected={selected}
                aria-controls={`documents-links-${tab.id}-panel`}
                className={`inline-flex items-center gap-2 border-b-2 px-5 py-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                  selected
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div id={`documents-links-${activeTab}-panel`} role="tabpanel" aria-label={activeTabLabel} className="p-5 sm:p-6">
          {activeTab === "resources" ? (
            <ExhibitorDocumentsHub embedded googleWorkspace={googleWorkspace} />
          ) : (
            <ExhibitorEmailTemplatesClient embedded />
          )}
        </div>
      </section>
    </PageShell>
  );
}
