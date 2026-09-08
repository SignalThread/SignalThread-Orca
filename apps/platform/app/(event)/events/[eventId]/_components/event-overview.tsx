import type { EventOverviewModel } from "@/lib/event-overview/view-model";
import { AcrossSignalThread } from "./across-signalthread";
import { ConnectedPlatform } from "./connected-platform";
import { EventFooter } from "./event-footer";
import { EventHeading } from "./event-heading";
import { GoDeeper } from "./go-deeper";
import { NeedsAttention } from "./needs-attention";

/**
 * The connected-event dashboard, purely presentational: given a view model it
 * renders one event being operated by SignalThread — event first, then the
 * lifecycle every product shares, then what spans products, what needs
 * attention, and where the deep work happens.
 */
export function EventOverview({ model }: { model: EventOverviewModel }) {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col [overflow-wrap:anywhere]" data-testid="event-overview">
      <EventHeading model={model} />
      <ConnectedPlatform model={model} />
      <AcrossSignalThread model={model} />
      <NeedsAttention model={model} />
      <GoDeeper model={model} />
      <EventFooter model={model} />
    </div>
  );
}
