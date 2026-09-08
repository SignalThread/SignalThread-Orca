import { redirect } from "next/navigation";

export default function LegacyOrganizerDashboardRedirectPage() {
  redirect("/app/organizer");
}
