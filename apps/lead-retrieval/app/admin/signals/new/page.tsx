import { SignalCreatePage } from "@/components/signals/signal-create-page";
import { requireAuth } from "@/lib/auth/session";

export default async function AdminNewSignalPage() {
  const sessionUser = await requireAuth();

  return <SignalCreatePage role={sessionUser.role ?? ""} userId={sessionUser.id} libraryBasePath="/admin/signals" />;
}
