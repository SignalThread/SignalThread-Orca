import "server-only";

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteAuth } from "@/lib/supabase/route-auth";
import { resolveAccessibleEventIdsForUser } from "@/lib/server/company-event-access";
import { establishLeadRetrievalSessionWithDeps } from "@/lib/platform/establish-session";
import { readExistingLeadRetrievalSessionUserId } from "@/lib/platform/existing-session";
import { resolvePlatformEntry } from "@/lib/platform/handoff-entry";
import { createSupabaseMappingDeps } from "@/lib/platform/identity-mapping-supabase";
import { claimPlatformHandoff } from "@/lib/platform/platform-claim-client";
import type { EstablishedSession, PlatformEntryDeps } from "@/lib/platform/platform-entry-core";

/**
 * Production wiring for the Platform → Lead Retrieval entry route.
 *
 *   claim           → Platform's /api/launch/lead-retrieval/claim (plain HTTPS)
 *   mapping         → LR's own mapping columns via the service-role client
 *   resolveAccess   → LR's canonical accessible-event resolver
 *   establishSession→ LR Auth (this project) through the request-scoped SSR client,
 *                     so the resulting cookies are exactly what a normal login writes
 */
export function buildPlatformEntryDeps(request: NextRequest): PlatformEntryDeps {
  return {
    resolveEntry: (input) =>
      resolvePlatformEntry(input, {
        claim: (claimInput) => claimPlatformHandoff(claimInput),
        mapping: createSupabaseMappingDeps(),
        resolveAccess: async (lrUserId) => {
          const access = await resolveAccessibleEventIdsForUser({ userId: lrUserId });
          return { resolution: access.resolution, eventIds: access.eventIds };
        }
      }),

    readExistingSessionUserId: (req) => readExistingLeadRetrievalSessionUserId(req),

    establishSession: async (lrUserId): Promise<EstablishedSession> => {
      let admin: ReturnType<typeof createAdminClient>;
      let routeAuth: ReturnType<typeof createSupabaseRouteAuth>;
      try {
        admin = createAdminClient();
        routeAuth = createSupabaseRouteAuth(request);
      } catch {
        return { ok: false, reason: "AUTH_NOT_CONFIGURED" };
      }

      const result = await establishLeadRetrievalSessionWithDeps(lrUserId, {
        async getAuthUserById(userId) {
          const { data, error } = await admin.auth.admin.getUserById(userId);
          const user = data?.user;
          if (error || !user) return null;
          return { id: user.id, email: user.email ?? null, bannedUntil: user.banned_until ?? null };
        },
        async generateMagicLink(email) {
          const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
          const hashedToken = data?.properties?.hashed_token;
          if (error || !hashedToken) return null;
          return { hashedToken, userId: data.user?.id ?? null };
        },
        async verifyOtp(hashedToken) {
          const { data, error } = await routeAuth.supabase.auth.verifyOtp({ type: "magiclink", token_hash: hashedToken });
          if (error || !data.session) return null;
          return { userId: data.user?.id ?? data.session.user?.id ?? null };
        }
      });

      if (!result.ok) return result;
      return { ok: true, userId: result.userId, attachCookies: (response) => routeAuth.withAuthCookies(response) };
    }
  };
}
