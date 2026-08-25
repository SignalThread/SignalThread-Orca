import { createHash, randomBytes } from "node:crypto";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { logSpeakerActivity } from "@/src/server/services/speaker-comms";

export class SpeakerPortalTokenError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status = 400, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

type RequestUserContext = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

const DEFAULT_EXPIRY_SECONDS = 60 * 60 * 24 * 7;
const RAW_TOKEN_BYTES = 32;

export type SpeakerPortalTokenStatus = {
  tokenId: string;
  createdAt: string;
  expiresAt: string;
  submittedAt: string | null;
  revokedAt: string | null;
  isExpired: boolean;
  isActive: boolean;
};

export type SpeakerPortalTokenGrant = {
  tokenId: string;
  /** Raw token — returned exactly once at generation. Never persisted. */
  token: string;
  portalUrl: string;
  expiresAt: string;
};

export type ResolvedSpeakerPortalToken = {
  tokenId: string;
  eventId: string;
  speakerId: string;
};

export function hashSpeakerPortalToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function buildSpeakerPortalUrl(origin: string, rawToken: string): string {
  return new URL(`/speaker-portal/${encodeURIComponent(rawToken)}`, origin).toString();
}

function asPortalTokenError(error: unknown, fallbackMessage: string): SpeakerPortalTokenError {
  if (error instanceof SpeakerPortalTokenError) {
    return error;
  }

  if (error instanceof EventAccessError) {
    return new SpeakerPortalTokenError(error.message, error.status, error.reason);
  }

  return new SpeakerPortalTokenError(fallbackMessage, 500);
}

async function assertSpeakerInEvent(eventId: string, speakerId: string): Promise<{ id: string; name: string }> {
  const speaker = await getPrisma().speaker.findFirst({
    where: { id: speakerId, eventId },
    select: { id: true, name: true },
  });

  if (!speaker) {
    throw new SpeakerPortalTokenError("Speaker not found", 404);
  }
  return speaker;
}

export async function generateSpeakerPortalToken(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
  options: { origin: string; expiresInSeconds?: number },
): Promise<SpeakerPortalTokenGrant> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    const speaker = await assertSpeakerInEvent(eventId, speakerId);

    const rawToken = randomBytes(RAW_TOKEN_BYTES).toString("base64url");
    const tokenHash = hashSpeakerPortalToken(rawToken);
    const expiresAt = new Date(Date.now() + (options.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS) * 1000);
    const now = new Date();

    const created = await getPrisma().$transaction(async (tx) => {
      await tx.speakerIntakeToken.updateMany({
        where: {
          speakerId,
          eventId,
          revokedAt: null,
          submittedAt: null,
        },
        data: { revokedAt: now },
      });

      const token = await tx.speakerIntakeToken.create({
        data: {
          speakerId,
          eventId,
          tokenHash,
          expiresAt,
        },
        select: { id: true, expiresAt: true },
      });

      await tx.speaker.update({
        where: { id: speakerId },
        data: { intakeTokenSentAt: now },
      });

      await logSpeakerActivity(eventId, user.id, `Portal link generated for ${speaker.name}`, {
        tx,
        action: "GENERATED",
        entityId: speaker.id,
        entityLabel: speaker.name,
        source: { type: "SpeakerIntakeToken", id: token.id },
      });

      return token;
    });

    return {
      tokenId: created.id,
      token: rawToken,
      portalUrl: buildSpeakerPortalUrl(options.origin, rawToken),
      expiresAt: created.expiresAt.toISOString(),
    };
  } catch (error) {
    throw asPortalTokenError(error, "Failed to generate portal link");
  }
}

export async function revokeSpeakerPortalTokens(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<{ revoked: number }> {
  try {
    await assertEventAccessForUser(eventId, user, "write");
    await assertSpeakerInEvent(eventId, speakerId);

    const result = await getPrisma().speakerIntakeToken.updateMany({
      where: {
        speakerId,
        eventId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (result.count > 0) {
      await logSpeakerActivity(eventId, user.id, "Speaker portal link revoked");
    }

    return { revoked: result.count };
  } catch (error) {
    throw asPortalTokenError(error, "Failed to revoke portal link");
  }
}

export async function getSpeakerPortalTokenStatus(
  eventId: string,
  speakerId: string,
  user: RequestUserContext,
): Promise<SpeakerPortalTokenStatus | null> {
  try {
    await assertEventAccessForUser(eventId, user, "read");
    await assertSpeakerInEvent(eventId, speakerId);

    const latest = await getPrisma().speakerIntakeToken.findFirst({
      where: { speakerId, eventId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        submittedAt: true,
        revokedAt: true,
      },
    });

    if (!latest) return null;

    const isExpired = latest.expiresAt.getTime() < Date.now();
    return {
      tokenId: latest.id,
      createdAt: latest.createdAt.toISOString(),
      expiresAt: latest.expiresAt.toISOString(),
      submittedAt: latest.submittedAt?.toISOString() ?? null,
      revokedAt: latest.revokedAt?.toISOString() ?? null,
      isExpired,
      isActive: !latest.revokedAt && !isExpired,
    };
  } catch (error) {
    throw asPortalTokenError(error, "Failed to load portal link status");
  }
}

/**
 * Resolves a raw portal token for public (unauthenticated) portal access.
 * Rejects unknown, expired, and revoked tokens; resolves only the single
 * speaker/event the token was minted for.
 */
export async function resolveSpeakerPortalToken(rawToken: string): Promise<ResolvedSpeakerPortalToken> {
  const normalized = rawToken.trim();
  if (!normalized) {
    throw new SpeakerPortalTokenError("Invalid portal link.", 401);
  }

  const record = await getPrisma().speakerIntakeToken.findUnique({
    where: { tokenHash: hashSpeakerPortalToken(normalized) },
    select: {
      id: true,
      eventId: true,
      speakerId: true,
      expiresAt: true,
      revokedAt: true,
      speaker: { select: { eventId: true } },
    },
  });

  if (!record) {
    throw new SpeakerPortalTokenError("Invalid portal link.", 401);
  }

  if (record.revokedAt) {
    throw new SpeakerPortalTokenError("This portal link has been revoked.", 401);
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new SpeakerPortalTokenError("This portal link has expired.", 401);
  }

  if (record.speaker.eventId !== record.eventId) {
    throw new SpeakerPortalTokenError("Invalid portal link.", 401);
  }

  return {
    tokenId: record.id,
    eventId: record.eventId,
    speakerId: record.speakerId,
  };
}

export async function markSpeakerPortalTokenSubmitted(tokenId: string): Promise<void> {
  const now = new Date();
  await getPrisma().$transaction(async (tx) => {
    const token = await tx.speakerIntakeToken.update({
      where: { id: tokenId },
      data: { submittedAt: now },
      select: { speakerId: true, eventId: true },
    });

    const speakerUpdate = await tx.speaker.updateMany({
      where: { id: token.speakerId, eventId: token.eventId },
      data: { intakeSubmittedAt: now },
    });
    if (speakerUpdate.count !== 1) {
      throw new SpeakerPortalTokenError("Invalid portal link.", 401);
    }
  });
}
