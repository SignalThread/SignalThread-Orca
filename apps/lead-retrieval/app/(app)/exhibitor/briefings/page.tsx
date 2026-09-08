import { BriefingSetupClient } from "@/components/exhibitor/briefing-setup-client";
import { BriefingsWorkspacesSection } from "@/components/exhibitor/briefings-workspaces-section";

/** Unified AI Briefings hub — strategy (collapsible) above, workspaces always visible below. */
export default function ExhibitorBriefingsLandingPage() {
  return (
    <div className="space-y-0" data-testid="briefings-unified-hub">
      <BriefingSetupClient />
      <BriefingsWorkspacesSection />
    </div>
  );
}
