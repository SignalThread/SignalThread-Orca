type EventEditPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventEditPage({ params }: EventEditPageProps) {
  const { eventId } = await params;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-[24px] leading-[28px] font-semibold text-slate-800">Edit Event</h2>
      <p className="mt-3 text-lg text-slate-500">Event ID: {eventId}</p>
    </section>
  );
}
