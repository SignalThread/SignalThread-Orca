import { redirect } from "next/navigation";

export default function LegacyExhibitorEmailTemplatesRedirectPage() {
  redirect("/exhibitor/documents?tab=email-templates");
}
