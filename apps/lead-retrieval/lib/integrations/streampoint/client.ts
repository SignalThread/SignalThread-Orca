import "server-only";

const STREAMPPOINT_UAT_BASE_URL = "https://apireststaging.streampoint.com/v1/personal.svc";
const STREAMPPOINT_PROD_BASE_URL = "https://apirest.streampoint.com/v1/personal.svc";
const STREAMPPOINT_ENVIRONMENTS = {
  staging: STREAMPPOINT_UAT_BASE_URL,
  production: STREAMPPOINT_PROD_BASE_URL
} as const;

export type StreampointEnvironment = keyof typeof STREAMPPOINT_ENVIRONMENTS;

type StreampointRequestOptions = {
  apiToken?: string | null;
  baseUrl?: string | null;
  environment?: string | null;
};

type StreampointPersonRecord = {
  FirstName?: unknown;
  LastName?: unknown;
  Email?: unknown;
  Association?: unknown;
  Title?: unknown;
  Barcode?: unknown;
  RegType?: unknown;
  BadgeID?: unknown;
  ConfirmationNumber?: unknown;
  [key: string]: unknown;
};

export type NormalizedStreampointPerson = {
  externalRegistrantId: string | null;
  confirmationId: string | null;
  badgeId: string | null;
  barcode: string | null;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
  companyName: string | null;
  registrationType: string | null;
  raw: unknown;
};

export class StreampointClientError extends Error {
  readonly code:
    | "MISSING_TOKEN"
    | "INVALID_CONFIRMATION_ID"
    | "HTTP_ERROR"
    | "BAD_RESPONSE"
    | "NOT_FOUND";
  readonly status?: number;

  constructor(
    code: StreampointClientError["code"],
    message: string,
    options?: { status?: number; cause?: unknown }
  ) {
    super(message);
    this.name = "StreampointClientError";
    this.code = code;
    this.status = options?.status;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function asTrimmedString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function safeJsonParse(input: string): unknown {
  if (!input) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function looksLikePersonRecord(value: unknown): value is StreampointPersonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    "FirstName" in record ||
    "LastName" in record ||
    "Email" in record ||
    "Association" in record ||
    "BadgeID" in record ||
    "ConfirmationNumber" in record
  );
}

function extractPersonRecord(payload: unknown): StreampointPersonRecord | null {
  if (looksLikePersonRecord(payload)) {
    return payload;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const candidate = extractPersonRecord(item);
      if (candidate) return candidate;
    }
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidateKeys = [
    "person",
    "Person",
    "data",
    "Data",
    "result",
    "Result",
    "d",
    "value",
    "LeadRetrieval_GetPersonByConfirmationIdResult"
  ];

  for (const key of candidateKeys) {
    if (key in record) {
      const nested = extractPersonRecord(record[key]);
      if (nested) return nested;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const nested = extractPersonRecord(nestedValue);
    if (nested) return nested;
  }

  return null;
}

function normalizePerson(payload: unknown, normalizedConfirmationId: string): NormalizedStreampointPerson {
  const person = extractPersonRecord(payload);
  if (!person) {
    throw new StreampointClientError(
      "NOT_FOUND",
      "No registrant was found for the provided confirmation ID."
    );
  }

  const firstName = asTrimmedString(person.FirstName);
  const lastName = asTrimmedString(person.LastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    externalRegistrantId: null,
    confirmationId: asTrimmedString(person.ConfirmationNumber) ?? normalizedConfirmationId,
    badgeId: asTrimmedString(person.BadgeID),
    barcode: asTrimmedString(person.Barcode),
    fullName,
    firstName,
    lastName,
    email: asTrimmedString(person.Email),
    jobTitle: asTrimmedString(person.Title),
    companyName: asTrimmedString(person.Association),
    registrationType: asTrimmedString(person.RegType),
    raw: payload
  };
}

function normalizeEnvironment(value: string | null | undefined): StreampointEnvironment {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "production" || normalized === "prod") return "production";
  return "staging";
}

function getStreampointBaseUrl(options?: Pick<StreampointRequestOptions, "baseUrl" | "environment">) {
  const explicitBaseUrl = asTrimmedString(options?.baseUrl);
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  const environment = normalizeEnvironment(asTrimmedString(options?.environment) ?? "staging");
  return STREAMPPOINT_ENVIRONMENTS[environment];
}

function normalizeConfirmationId(input: string) {
  return String(input ?? "").trim().replaceAll("-", "");
}

async function streampointFetch(path: string, options?: StreampointRequestOptions) {
  const token = asTrimmedString(options?.apiToken);
  if (!token) {
    throw new StreampointClientError(
      "MISSING_TOKEN",
      "No active Streampoint configuration found for this event."
    );
  }

  const baseUrl = getStreampointBaseUrl({
    baseUrl: options?.baseUrl ?? null,
    environment: options?.environment ?? null
  });
  const normalizedPath = String(path ?? "").trim();
  const url = normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")
    ? normalizedPath
    : `${baseUrl}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-auth-token": token
    },
    cache: "no-store"
  });

  const responseText = await response.text().catch(() => "");
  const payload = safeJsonParse(responseText);

  if (!response.ok) {
    let apiMessage = `Streampoint request failed with status ${response.status}.`;
    if (payload && typeof payload === "object") {
      const messageFromPayload =
        asTrimmedString((payload as Record<string, unknown>).message) ??
        asTrimmedString((payload as Record<string, unknown>).Message);
      if (messageFromPayload) {
        apiMessage = messageFromPayload;
      }
    }

    throw new StreampointClientError("HTTP_ERROR", apiMessage, {
      status: response.status,
      cause: payload
    });
  }

  return payload;
}

export async function getPersonByConfirmationId(confirmationId: string, options?: StreampointRequestOptions) {
  const normalizedConfirmationId = normalizeConfirmationId(confirmationId);
  if (!normalizedConfirmationId) {
    throw new StreampointClientError(
      "INVALID_CONFIRMATION_ID",
      "confirmationId is required."
    );
  }

  const payload = await streampointFetch(
    `/LeadRetrieval/GetPersonByConfirmationId?confirmationId=${encodeURIComponent(
      normalizedConfirmationId
    )}`,
    options
  );

  return normalizePerson(payload, normalizedConfirmationId);
}
