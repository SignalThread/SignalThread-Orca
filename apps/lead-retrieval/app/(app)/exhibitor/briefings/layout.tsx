import { PageHeader, PageShell } from "@/components/layout/page-header";

export default function ExhibitorBriefingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <PageHeader
        title="AI Briefings"
        subtitle="Configure strategy once at the top, then run imports and briefs in workspaces below — one continuous flow."
      />
      {children}
    </PageShell>
  );
}
