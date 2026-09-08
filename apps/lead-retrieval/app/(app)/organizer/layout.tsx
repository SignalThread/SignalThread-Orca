import { requireRole } from "@/lib/auth/session";

export default async function OrganizerLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireRole("organizer_admin");
  return children;
}
