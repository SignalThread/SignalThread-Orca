import { redirect } from "next/navigation";
import { IMPORT_WIZARD_BASE_PATH } from "@/lib/import-wizard/paths";

/** Import wizard lives on the exhibitor surface; keep old path from bookmarking. */
export default function AdminImportWizardRedirectPage() {
  redirect(IMPORT_WIZARD_BASE_PATH);
}
