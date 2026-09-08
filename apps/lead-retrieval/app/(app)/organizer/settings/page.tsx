import { redirect } from "next/navigation";

export default function LegacyOrganizerSettingsRedirectPage() {
  redirect("/app/organizer");
}
