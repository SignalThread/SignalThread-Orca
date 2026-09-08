import { redirect } from "next/navigation";
import { EXHIBITOR_BRIEFINGS_PATH } from "@/lib/import-wizard/paths";

/** Legacy `/briefings/setup` — Setup now lives at the Briefings root. */
export default function BriefingSetupLegacyRedirect() {
  redirect(EXHIBITOR_BRIEFINGS_PATH);
}
