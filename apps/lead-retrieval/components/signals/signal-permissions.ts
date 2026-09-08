export function resolveCanManageSignals(role: string | undefined, userId: string): boolean {
  if (!userId) return false;
  const normalized = String(role ?? "").trim().toLowerCase();
  return (
    normalized === "platform_admin" ||
    normalized === "organizer_admin" ||
    normalized === "event_organizer" ||
    normalized === "exhibitor_admin"
  );
}
