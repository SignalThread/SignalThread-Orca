"use client";

import Link from "next/link";
import { Button } from "@signalthread/ui";

/** This boundary sits above the event layout, so registry and shell-loading failures are caught too. */
export default function EventError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-16" role="alert">
      <h1 className="text-xl font-semibold">The event overview couldn’t load</h1>
      <p className="mt-2 text-sm text-slate-600">Event information is unavailable right now. Try again or return to your events.</p>
      <div className="mt-5 flex items-center gap-4">
        <Button onClick={retry}>Try again</Button>
        <Link href="/events" className="text-sm underline">Back to Events</Link>
      </div>
    </main>
  );
}
