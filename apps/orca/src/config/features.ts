export const FEATURES = {
  COPILOT_ENABLED: false,
  ENABLE_GENERIC_TASKING_UI: false,
};

type RuntimeEnv = Record<string, string | undefined>;

/**
 * Room Set and Seating are unfinished and must read as "Coming soon" in every runtime,
 * including local development. Previously this was enabled whenever NODE_ENV was
 * "development", which made an incomplete module look live in the session workspace: an
 * enabled tab, a readiness card, a Blocked status, capacity messaging, and an editor action.
 *
 * The work is preserved, not deleted. Set NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW=true to opt a
 * local session (or the room-set end-to-end suites) back into the in-progress module. Nothing
 * deployed can enable it, because the production-lockout flag still wins.
 */
export const ROOM_SET_SEATING_ENABLED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW === "true" &&
  process.env.NEXT_PUBLIC_PW_E2E_PRODUCTION_AVAILABILITY !== "true";

export function isProductionRuntime(env: RuntimeEnv = process.env): boolean {
  const deploymentEnv = env.NEXT_PUBLIC_VERCEL_ENV ?? env.VERCEL_ENV;
  if (deploymentEnv) return deploymentEnv === "production";
  return env.NODE_ENV === "production";
}

export function shouldGateComingSoonFeatures(env: RuntimeEnv = process.env): boolean {
  return isProductionRuntime(env);
}

export const SESSION_REGISTRATION_COMING_SOON_BADGE = "Coming soon";
export const SESSION_REGISTRATION_COMING_SOON_COPY = "Session registration is coming soon.";

/**
 * Session registration has not shipped yet. Keep this separate from event
 * authorization so unsupported session enrollment reads and writes cannot be
 * exposed through an otherwise authorized event surface.
 */
export const SESSION_REGISTRATION_ENABLED = false;

export function isSessionRegistrationAvailable(): boolean {
  return SESSION_REGISTRATION_ENABLED;
}

export function shouldGateSessionRegistration(env: RuntimeEnv = process.env): boolean {
  void env;
  return !isSessionRegistrationAvailable();
}

export const ROOM_SET_SEATING_COMBINED_LABEL = "Room & Guest Setup";
export const ROOM_SET_SEATING_COMING_SOON_BADGE = "Coming soon";
export const ROOM_SET_SEATING_UNAVAILABLE_COPY = "Room Set and Seating are coming soon.";

export function isRoomSetAndSeatingAvailable(): boolean {
  return ROOM_SET_SEATING_ENABLED;
}

export function isSessionModuleAvailable(module: string): boolean {
  return module !== "room-set" && module !== "seating" || ROOM_SET_SEATING_ENABLED;
}

/** @deprecated Use isRoomSetAndSeatingAvailable for new availability checks. */
export function isRoomSetAndSeatingProductionAvailable(): boolean {
  return ROOM_SET_SEATING_ENABLED;
}

/** @deprecated Use isRoomSetAndSeatingAvailable for new availability checks. */
export function shouldCollapseRoomSetAndSeating(): boolean {
  return !ROOM_SET_SEATING_ENABLED;
}
