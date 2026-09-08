import type { EventOverviewModel } from "@/lib/event-overview/view-model";
import { Eyebrow } from "./primitives";

/** Supporting event information: quiet, subordinate to the operational dashboard above it. */
export function EventFooter({ model }: { model: EventOverviewModel }) {
  return (
    <dl
      className="mt-10 grid grid-cols-2 gap-y-5 border-t pt-5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-y-0"
      style={{ borderColor: "var(--border-subtle)" }}
      data-testid="event-footer"
    >
      {model.footer.map((field, index) => (
        <div
          key={field.label}
          className={`flex min-w-0 flex-col gap-1 pr-4 lg:px-5 ${index === 0 ? "lg:pl-0" : "lg:border-l"} ${
            index === model.footer.length - 1 ? "lg:pr-0" : ""
          }`}
          style={{ borderColor: "var(--border-hairline)" }}
        >
          <dt>
            <Eyebrow>{field.label}</Eyebrow>
          </dt>
          <dd
            className={`m-0 [overflow-wrap:anywhere] ${field.mono ? "font-mono text-xs leading-[18px]" : "text-[13px] leading-[18px] font-medium"}`}
            style={{ color: field.mono ? "var(--text-muted)" : "var(--text-body)" }}
            title={field.title ? `${field.value} · ${field.title}` : field.value}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
