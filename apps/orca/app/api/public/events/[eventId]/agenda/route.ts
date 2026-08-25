import { NextResponse } from "next/server";
import { listPublishedEventAgenda } from "@/lib/session-show-flow";
import { getEventTerminology } from "@/lib/orca-terminology";
import { ORCA_CANONICAL_TERMS } from "@/lib/orca-terminology-contract";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  try {
    const [agenda, terminology] = await Promise.all([listPublishedEventAgenda(eventId), getEventTerminology(eventId)]);
    return NextResponse.json({ agenda, displayLabel: terminology.terms.agenda });
  } catch {
    // Public routes never expose database or publication lookup details.
    return NextResponse.json({ agenda: [], displayLabel: ORCA_CANONICAL_TERMS.agenda });
  }
}
