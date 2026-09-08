import { requireRole } from "@/lib/auth/session";

export default async function OrganizerAppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireRole("organizer_admin");
  return children;
}
