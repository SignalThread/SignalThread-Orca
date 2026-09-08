import Link from "next/link";
import { Badge } from "@signalthread/ui";
import type { EventOverviewModel } from "@/lib/event-overview/view-model";
import { ChevronLeftIcon } from "./icons";
import { Eyebrow } from "./primitives";

export function EventHeading({ model }: { model: EventOverviewModel }) {
  return (
    <>
      <Link
        href="/events"
        className="-my-3 inline-flex min-h-11 w-max items-center gap-1.5 text-[13px] leading-4 font-medium hover:underline sm:my-0 sm:min-h-0"
        style={{ color: "var(--text-muted)" }}
      >
        <ChevronLeftIcon size={14} />
        Events
      </Link>

      <div className="mt-[18px] flex flex-col gap-2">
        <Eyebrow>Event</Eyebrow>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <h1
            className="min-w-0 text-[28px] leading-8 font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-[32px] sm:leading-9"
            style={{ color: "var(--text-strong)" }}
          >
            {model.event.name}
          </h1>
          <Badge tone={model.health.tone} withDot style={{ height: 22, paddingBlock: 0, fontSize: 12, lineHeight: "16px" }} data-testid="event-health">
            {model.health.label}
          </Badge>
        </div>
        <p className="text-sm leading-5" style={{ color: "var(--text-muted)" }}>
          {model.headingMeta.join(" · ")}
        </p>
      </div>
    </>
  );
}
