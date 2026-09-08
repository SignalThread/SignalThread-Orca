import Link from "next/link";

export default function EventNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3 py-10">
      <span className="st-eyebrow" style={{ color: "var(--text-subtle)" }}>
        Event
      </span>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]" style={{ color: "var(--text-strong)" }}>
        This event is not available
      </h1>
      <p className="max-w-[60ch] text-sm leading-5" style={{ color: "var(--text-muted)" }}>
        It may not exist, or it belongs to an organization this account is not a member of.
      </p>
      <Link href="/events" className="text-sm font-medium hover:underline" style={{ color: "var(--text-link)" }}>
        Back to events
      </Link>
    </div>
  );
}
