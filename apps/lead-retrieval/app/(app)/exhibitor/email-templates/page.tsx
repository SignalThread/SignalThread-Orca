import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

export default async function ExhibitorEmailTemplatesPage() {
  await requireRole("exhibitor_admin");
  redirect("/exhibitor/documents?tab=email-templates");
}
