import Matrix2Page from "@/app/(shell)/matrix-2/page";

type EventMatrixPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventMatrixPage({ params }: EventMatrixPageProps) {
  const { eventId } = await params;
  return <Matrix2Page eventIdOverride={eventId} hideEventSelector />;
}
