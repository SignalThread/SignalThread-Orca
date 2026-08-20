import { createHmac, timingSafeEqual } from "node:crypto";

export class MarketingUnsubscribeTokenError extends Error {
  status: number;

  constructor(message = "Invalid unsubscribe link.", status = 401) {
    super(message);
    this.status = status;
  }
}

export type MarketingUnsubscribeTokenPayload = {
  v: 1;
  eventId: string;
  emailSendId: string;
  emailSendRecipientId: string;
  email: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getMarketingUnsubscribeSecret(): string {
  const secret = process.env.MARKETING_UNSUBSCRIBE_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new MarketingUnsubscribeTokenError("Marketing unsubscribe is not configured.", 500);
  }
  return secret;
}

function sign(input: string): string {
  return createHmac("sha256", getMarketingUnsubscribeSecret()).update(input).digest("base64url");
}

function assertPayload(value: unknown): MarketingUnsubscribeTokenPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MarketingUnsubscribeTokenError();
  }
  const payload = value as Record<string, unknown>;
  if (
    payload.v !== 1 ||
    typeof payload.eventId !== "string" ||
    !UUID_REGEX.test(payload.eventId) ||
    typeof payload.emailSendId !== "string" ||
    !UUID_REGEX.test(payload.emailSendId) ||
    typeof payload.emailSendRecipientId !== "string" ||
    !UUID_REGEX.test(payload.emailSendRecipientId) ||
    typeof payload.email !== "string" ||
    !EMAIL_REGEX.test(payload.email.trim())
  ) {
    throw new MarketingUnsubscribeTokenError();
  }
  return {
    v: 1,
    eventId: payload.eventId,
    emailSendId: payload.emailSendId,
    emailSendRecipientId: payload.emailSendRecipientId,
    email: payload.email.trim(),
  };
}

export function createMarketingUnsubscribeToken(
  payload: MarketingUnsubscribeTokenPayload,
): string {
  const normalized = assertPayload(payload);
  const encodedPayload = toBase64Url(JSON.stringify(normalized));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyMarketingUnsubscribeToken(token: string): MarketingUnsubscribeTokenPayload {
  const [encodedPayload, encodedSignature] = token.trim().split(".");
  if (!encodedPayload || !encodedSignature) {
    throw new MarketingUnsubscribeTokenError();
  }

  const expectedSignature = sign(encodedPayload);
  const actualSignature = Buffer.from(encodedSignature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    actualSignature.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(actualSignature, expectedSignatureBuffer)
  ) {
    throw new MarketingUnsubscribeTokenError();
  }

  try {
    return assertPayload(JSON.parse(fromBase64Url(encodedPayload)));
  } catch (error) {
    if (error instanceof MarketingUnsubscribeTokenError) throw error;
    throw new MarketingUnsubscribeTokenError();
  }
}

export function getMarketingPublicBaseUrl(): string {
  const configured = process.env.MARKETING_PUBLIC_BASE_URL?.trim();
  if (!configured) {
    throw new MarketingUnsubscribeTokenError("Marketing unsubscribe public URL is not configured.", 500);
  }
  try {
    return new URL(configured).origin;
  } catch {
    throw new MarketingUnsubscribeTokenError("Marketing unsubscribe public URL is invalid.", 500);
  }
}

export function assertMarketingUnsubscribeConfigured(): void {
  getMarketingUnsubscribeSecret();
  getMarketingPublicBaseUrl();
}

export function buildMarketingUnsubscribeUrl(token: string, baseUrl = getMarketingPublicBaseUrl()): string {
  return new URL(`/marketing/unsubscribe/${encodeURIComponent(token)}`, baseUrl).toString();
}
