import { redirect } from "next/navigation";
import { batchBriefingsReviewPath } from "@/lib/import-wizard/paths";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ batchId: string }> };

/**
 * Legacy `/briefings/view` route — redirects to the new `/briefings/review` route.
 */
export default async function BatchViewBriefRedirect({ params }: Props) {
  const { batchId } = await params;
  redirect(batchBriefingsReviewPath(batchId));
}
