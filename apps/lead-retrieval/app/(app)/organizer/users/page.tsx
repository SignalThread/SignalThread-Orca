import { redirect } from "next/navigation";

export default function LegacyOrganizerUsersRedirectPage() {
  redirect("/app/organizer/users");
}
