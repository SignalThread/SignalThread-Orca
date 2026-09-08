import { BackLink } from "@/components/navigation/back-link";
import {
  buildExhibitorDashboardHref,
  buildExhibitorLeadsIntelligenceHref,
  parseLeadsIntelligenceView,
  type LeadsIntelligenceView
} from "@/lib/leads/exhibitorLeadsDrilldown";

type ExhibitorLeadsContextNavProps = {
  eventId: string | null;
  variant: "list" | "detail";
  /** Preserves list filters when linking back from lead detail */
  leadsListQuery?: {
    view?: string | null;
    q?: string | null;
  };
};

export function ExhibitorLeadsContextNav({ eventId, variant, leadsListQuery }: ExhibitorLeadsContextNavProps) {
  const dashHref = buildExhibitorDashboardHref({ eventId: eventId ?? undefined });
  const viewForBack = viewFromQuery(leadsListQuery?.view);
  const leadsHref = buildExhibitorLeadsIntelligenceHref({
    eventId: eventId ?? undefined,
    view: viewForBack,
    q: leadsListQuery?.q?.trim() || undefined
  });

  if (variant === "list") {
    return (
      <nav aria-label="Back">
        <BackLink href={dashHref}>
          <span aria-hidden>←</span> Back to Dashboard
        </BackLink>
      </nav>
    );
  }

  return (
    <nav aria-label="Back to leads list">
      <BackLink href={leadsHref}>
        <span aria-hidden>←</span> leads
      </BackLink>
    </nav>
  );
}

function viewFromQuery(raw: string | null | undefined): LeadsIntelligenceView | undefined {
  const v = parseLeadsIntelligenceView(raw ?? undefined);
  return v === "all" ? undefined : v;
}
