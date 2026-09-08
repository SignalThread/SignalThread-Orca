import { redirect } from "next/navigation";
import { EXHIBITOR_BRIEFINGS_PATH } from "@/lib/import-wizard/paths";

/** Legacy list URL — workspaces live on the unified Briefings hub below strategy. */
export default function ExhibitorBriefingsBatchesRedirectPage() {
  redirect(EXHIBITOR_BRIEFINGS_PATH);
}
