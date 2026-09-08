import { redirect } from "next/navigation";
import { EXHIBITOR_BRIEFINGS_SETUP_PATH } from "@/lib/import-wizard/paths";

/** Legacy Event Context route — merged into top-level Setup. */
export default function LegacyBatchContextRedirect() {
  redirect(EXHIBITOR_BRIEFINGS_SETUP_PATH);
}
