import { redirect } from "next/navigation";

export default function LegacyOrganizerCompaniesRedirectPage() {
  redirect("/app/organizer/exhibitors");
}
