import { SignalLibraryClient } from "@/components/signals/signal-library-client";
import { requireAuth } from "@/lib/auth/session";

export default async function AdminSignalsPage() {
  const sessionUser = await requireAuth();
  // TODO: reintroduce RBAC for /admin/signals route access.

  return <SignalLibraryClient role={sessionUser.role ?? ""} userId={sessionUser.id} libraryBasePath="/admin/signals" />;
}
