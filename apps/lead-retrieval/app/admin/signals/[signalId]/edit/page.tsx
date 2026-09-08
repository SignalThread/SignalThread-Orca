import { SignalEditPage } from "@/components/signals/signal-edit-page";
import { requireAuth } from "@/lib/auth/session";

export default async function AdminEditSignalPage({ params }: { params: Promise<{ signalId: string }> }) {
  const sessionUser = await requireAuth();
  const { signalId } = await params;

  return (
    <SignalEditPage
      signalId={signalId}
      role={sessionUser.role ?? ""}
      userId={sessionUser.id}
      libraryBasePath="/admin/signals"
    />
  );
}
