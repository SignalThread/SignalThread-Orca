import { redirect } from "next/navigation";
import { EXHIBITOR_BRIEFINGS_SETUP_PATH } from "@/lib/import-wizard/paths";

/** Legacy batch-scoped knowledge URL — Setup is product-level. */
export default function LegacyBatchKnowledgeRedirect() {
  redirect(EXHIBITOR_BRIEFINGS_SETUP_PATH);
}
