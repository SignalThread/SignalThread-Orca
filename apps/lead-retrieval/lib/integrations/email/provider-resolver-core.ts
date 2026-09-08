import type {
  EmailProvider,
  EmailProviderConnection,
  EmailProviderResolution,
  EligibleEmailSender
} from "@/lib/integrations/email/types";
import { EMAIL_PROVIDERS } from "@/lib/integrations/email/types";

export type EmailProviderCandidate = EmailProviderConnection & {
  healthy: boolean;
  reconnectRequired: boolean;
};

/** Pure safe projection of every healthy email-send candidate for clients. */
export function eligibleEmailSendersFromCandidates(input: {
  candidates: EmailProviderCandidate[];
  preferredProvider: EmailProvider | null;
}): EligibleEmailSender[] {
  return input.candidates
    .filter((candidate) => candidate.healthy)
    .sort(
      (left, right) =>
        EMAIL_PROVIDERS.indexOf(left.provider) - EMAIL_PROVIDERS.indexOf(right.provider)
    )
    .map((candidate) => ({
      provider: candidate.provider,
      accountEmail: candidate.senderEmail,
      isDefault: candidate.provider === input.preferredProvider
    }));
}

/** Pure deterministic selection over canonical provider health. */
export function resolveEmailProvider(input: {
  candidates: EmailProviderCandidate[];
  preferredProvider: EmailProvider | null;
  providerOverride?: EmailProvider;
}): EmailProviderResolution {
  if (input.providerOverride) {
    const requested = input.candidates.find(
      (candidate) => candidate.provider === input.providerOverride
    );
    // An explicit per-send request is never allowed to fall through to the
    // persisted default or a different healthy provider.
    if (requested?.healthy) {
      return { ok: true, connection: requested, source: "override" };
    }
    return {
      ok: false,
      outcome: requested ? "reconnect_required" : "missing_connection"
    };
  }

  const healthy = input.candidates.filter((candidate) => candidate.healthy);

  if (healthy.length === 1) {
    return { ok: true, connection: healthy[0], source: "only_healthy" };
  }
  if (healthy.length > 1) {
    const preferred = healthy.find((candidate) => candidate.provider === input.preferredProvider);
    if (preferred) return { ok: true, connection: preferred, source: "preference" };
    return { ok: false, outcome: "provider_selection_required" };
  }
  if (input.candidates.some((candidate) => candidate.reconnectRequired || !candidate.healthy)) {
    return { ok: false, outcome: "reconnect_required" };
  }
  return { ok: false, outcome: "missing_connection" };
}
