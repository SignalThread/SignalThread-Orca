import { getPrisma } from "@/lib/prisma";
import { verifySpeakerIntakeToken } from "@/src/server/services/speaker-intake";
import { getSpeakerForPublicIntake, SpeakerServiceError } from "@/src/server/services/speakers";
import { SpeakerIntakeForm } from "./_components/speaker-intake-form";

type SpeakerIntakePageProps = {
  params: Promise<{ token: string }>;
};

export default async function SpeakerIntakePage({ params }: SpeakerIntakePageProps) {
  const { token } = await params;

  try {
    const payload = verifySpeakerIntakeToken(token);
    const speaker = await getSpeakerForPublicIntake(payload.eventId, payload.speakerId);
    const event = await getPrisma().event.findUnique({
      where: { id: payload.eventId },
      select: { name: true },
    });

    return (
      <SpeakerIntakeForm
        token={token}
        eventName={event?.name ?? speaker.event.name}
        initialSpeaker={speaker}
      />
    );
  } catch (error) {
    const message = error instanceof SpeakerServiceError || error instanceof Error
      ? error.message
      : "This speaker intake link is invalid.";

    return (
      <main className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Speaker Intake</p>
          <h1 className="mt-3 text-[28px] leading-[32px] font-semibold text-slate-900">Link unavailable</h1>
          <p className="mt-3 text-[14px] text-slate-600">{message}</p>
        </div>
      </main>
    );
  }
}
