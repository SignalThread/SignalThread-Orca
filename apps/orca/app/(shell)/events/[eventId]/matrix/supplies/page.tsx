import { SuppliesRegister } from "./supplies-register";

export default async function SuppliesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <SuppliesRegister eventId={eventId} />;
}
