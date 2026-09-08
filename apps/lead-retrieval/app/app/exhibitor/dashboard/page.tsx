import { redirect } from "next/navigation";

export default function LegacyExhibitorDashboardRedirectPage() {
  redirect("/exhibitor/dashboard");
}
