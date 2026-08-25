import { NextResponse } from "next/server";

import {
  isRoomSetAndSeatingAvailable,
  ROOM_SET_SEATING_UNAVAILABLE_COPY,
} from "@/config/features";

/**
 * The server-side counterpart to the shared Room Set and Seating feature gate.
 * Return this response before authenticating or parsing a request so production
 * cannot use an API route to bypass the unavailable UI.
 */
export function roomSetAndSeatingUnavailableResponse(): NextResponse | null {
  if (isRoomSetAndSeatingAvailable()) return null;

  return NextResponse.json(
    {
      error: ROOM_SET_SEATING_UNAVAILABLE_COPY,
      code: "ROOM_SET_SEATING_UNAVAILABLE",
    },
    { status: 404 },
  );
}
