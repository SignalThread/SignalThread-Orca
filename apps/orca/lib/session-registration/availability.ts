import { NextResponse } from "next/server";

import {
  isSessionRegistrationAvailable,
  SESSION_REGISTRATION_COMING_SOON_COPY,
} from "@/config/features";

/** Server-side counterpart to the session-registration capability gate. */
export function sessionRegistrationUnavailableResponse(): NextResponse | null {
  if (isSessionRegistrationAvailable()) return null;

  return NextResponse.json(
    {
      error: SESSION_REGISTRATION_COMING_SOON_COPY,
      code: "SESSION_REGISTRATION_UNAVAILABLE",
    },
    { status: 404 },
  );
}
