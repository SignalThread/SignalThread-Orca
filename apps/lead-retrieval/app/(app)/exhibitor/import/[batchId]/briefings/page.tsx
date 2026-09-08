import { redirect } from "next/navigation";
import { batchBriefingsPath } from "@/lib/import-wizard/paths";

type Props = { params: Promise<{ batchId: string }> };

/** Legacy route — batch workspace moved under /exhibitor/briefings/[batchId]. */
export default async function LegacyBatchBriefingsRedirect({ params }: Props) {
  const { batchId } = await params;
  redirect(batchBriefingsPath(batchId));
}
