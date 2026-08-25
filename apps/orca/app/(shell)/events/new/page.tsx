import { Suspense } from "react";
import { NewEventBuilder } from "../_components/new-event-builder";

export default function NewEventPage() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-[13px] text-slate-500">Loading the event builder…</div>}>
      <NewEventBuilder />
    </Suspense>
  );
}
