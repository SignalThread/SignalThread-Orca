/**
 * Invitation ownership boundary.
 *
 * Platform Core owns canonical users and organization memberships, which makes invitations
 * a Platform Core responsibility. Orca must not:
 *
 *   - create canonical identities,
 *   - send authentication invitations from its own Supabase project,
 *   - or keep email-only placeholder `User` rows as an identity model.
 *
 * ## Current state
 *
 * The Platform Core Supabase project exists, so an operator can already invite a user
 * there directly through Supabase Auth's own invite flow. What does not exist is an
 * endpoint **Orca** can call to do it, together with the organization membership and
 * product entitlement that must accompany an invitation.
 *
 * Rather than invent a cross-database shortcut — writing into another product's store, or
 * minting Platform identities from Orca using a service-role key — the legacy Orca invite
 * path is *gated off* the moment Platform Core becomes the authentication authority.
 *
 * ## What Platform Core must expose before Orca-initiated invites work again
 *
 * An authenticated server-to-server endpoint, roughly:
 *
 *   POST {PLATFORM_CORE_API_URL}/v1/organizations/{organization_id}/invitations
 *   Authorization: Bearer {PLATFORM_CORE_SERVICE_TOKEN}
 *   { "email": "...", "product": "orca", "role": "..." }
 *
 * returning the canonical `user_id` so Orca can attach its own product-specific rows
 * (`EventMember`, `EventMemberRole`) to a real identity instead of an email placeholder.
 * `resolvePlatformInvitationCapability` is the single place that will flip once it exists.
 */

import { isPlatformCoreAuthAuthority } from "@/src/lib/supabase/auth-authority";

export type PlatformInvitationCapability =
  | {
      status: "PLATFORM_MANAGED";
      reason: string;
      hint: string;
    }
  | {
      status: "LEGACY_ORCA_INVITES";
    };

/**
 * Whether Orca may still run its own invitation flow.
 *
 * Legacy invites are permitted only while the legacy Orca project is the authentication
 * authority — i.e. before cutover, or during a deliberate rollback. Once Platform Core
 * authenticates, Orca creating identities in a project it does not own would be both
 * wrong and ineffective.
 */
export function resolvePlatformInvitationCapability(): PlatformInvitationCapability {
  if (!isPlatformCoreAuthAuthority()) {
    return { status: "LEGACY_ORCA_INVITES" };
  }

  return {
    status: "PLATFORM_MANAGED",
    reason: "INVITES_OWNED_BY_PLATFORM_CORE",
    hint: "Invitations are managed in SignalThread Platform Core. Invite the user there and grant them Orca access.",
  };
}

/** True when Orca's own invite route is disabled because Platform Core owns invitations. */
export function areOrcaInvitesDisabled(): boolean {
  return resolvePlatformInvitationCapability().status === "PLATFORM_MANAGED";
}
