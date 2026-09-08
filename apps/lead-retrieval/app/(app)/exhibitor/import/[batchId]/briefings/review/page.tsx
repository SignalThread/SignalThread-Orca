import { redirect } from "next/navigation";
import { batchBriefingsReviewPath } from "@/lib/import-wizard/paths";

type Props = { params: Promise<{ batchId: string }> };

export default async function LegacyBatchReviewRedirect({ params }: Props) {
  const { batchId } = await params;
  redirect(batchBriefingsReviewPath(batchId));
}
