import { redirect } from "next/navigation";

export default function SalesforceIntegrationPage() {
  redirect("/admin/integrations/salesforce/setup");
}
