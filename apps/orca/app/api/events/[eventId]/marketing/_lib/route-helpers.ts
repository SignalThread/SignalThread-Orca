import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  EventDirectoryPersonStatus,
  EventDirectoryRoleType,
  EventDirectorySourceType,
  MarketingCampaignStatus,
  MarketingEmailSendStatus,
} from "@prisma/client";
import { resolveRequestUser, type RequestUserResult } from "@/lib/request-user";
import { observeHandledRouteError } from "@/lib/observability/api-route";
import { MAX_IMPORT_ROWS } from "@/lib/import";
import { MarketingServiceError } from "@/src/server/services/marketing";

type RouteUser = Extract<RequestUserResult, { user: unknown }>["user"];

export const uuidSchema = z.string().uuid();

export const createAudienceSchema = z.object({
  name: z.string().trim().min(1),
  sourceLabel: z.string().trim().min(1).nullable().optional(),
});

const directoryAudienceSummaryFilterSchema = z.enum([
  "all",
  "contacts",
  "attendees",
  "speakers",
  "sponsorsExhibitors",
  "vipPress",
  "needsReview",
]);

export const createAudienceFromDirectorySchema = z.object({
  name: z.string().trim().min(1),
  selectionMode: z.enum(["manual", "selected", "filtered", "allMatching"]),
  personIds: z.array(uuidSchema).optional(),
  filters: z
    .object({
      search: z.string().nullable().optional(),
      role: z.nativeEnum(EventDirectoryRoleType).nullable().optional(),
      sourceType: z.nativeEnum(EventDirectorySourceType).nullable().optional(),
      status: z.nativeEnum(EventDirectoryPersonStatus).nullable().optional(),
      summaryFilter: directoryAudienceSummaryFilterSchema.optional(),
    })
    .optional(),
});

export const updateAudienceSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    sourceLabel: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const audienceRecipientSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  email: z.string().trim().email(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  registrationType: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

export const importRecipientsSchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .max(MAX_IMPORT_ROWS, `Import exceeds the maximum of ${MAX_IMPORT_ROWS} rows per upload.`),
});

const planningDateSchema = z.string().datetime().nullable().optional();
const requiredDateTimeSchema = z.string().datetime();

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  audienceLabel: z.string().nullable().optional(),
  marketingPlanId: uuidSchema.nullable().optional(),
  ownerUserId: uuidSchema.nullable().optional(),
  startDate: planningDateSchema,
  endDate: planningDateSchema,
});

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    audienceLabel: z.string().nullable().optional(),
    marketingPlanId: uuidSchema.nullable().optional(),
    status: z.nativeEnum(MarketingCampaignStatus).optional(),
    startDate: planningDateSchema,
    endDate: planningDateSchema,
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const createEmailSendSchema = z.object({
  campaignId: uuidSchema,
  audienceId: uuidSchema.nullable().optional(),
  subject: z.string().trim().min(1),
  previewText: z.string().nullable().optional(),
  bodyHtml: z.string().nullable().optional(),
  bodyText: z.string().nullable().optional(),
  fromEmail: z.string().trim().email().nullable().optional(),
  replyTo: z.string().nullable().optional(),
  registrationUrl: z.string().nullable().optional(),
  utmUrl: z.string().nullable().optional(),
  ownerUserId: uuidSchema.nullable().optional(),
  scheduledSendAt: planningDateSchema,
});

export const scheduleEmailSendSchema = z.object({
  scheduledSendAt: requiredDateTimeSchema,
});

export const submitEmailSendForApprovalSchema = z.object({
  approverUserId: uuidSchema,
});

export const emailSendApprovalDecisionSchema = z.object({
  note: z.string().trim().min(1).nullable().optional(),
});

export const updateEmailSendSchema = z
  .object({
    subject: z.string().trim().min(1).optional(),
    previewText: z.string().nullable().optional(),
    bodyHtml: z.string().nullable().optional(),
    bodyText: z.string().nullable().optional(),
    fromEmail: z.string().trim().email().optional(),
    replyTo: z.string().nullable().optional(),
    registrationUrl: z.string().nullable().optional(),
    utmUrl: z.string().nullable().optional(),
    audienceId: uuidSchema.nullable().optional(),
    ownerUserId: uuidSchema.nullable().optional(),
    scheduledSendAt: planningDateSchema,
    // Only CANCELED may be set manually.
    status: z.literal(MarketingEmailSendStatus.CANCELED).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const previewEmailSchema = z.object({
  audienceId: uuidSchema.nullable().optional(),
  recipientId: uuidSchema.nullable().optional(),
  subject: z.string().nullable().optional(),
  previewText: z.string().nullable().optional(),
  bodyHtml: z.string().nullable().optional(),
  bodyText: z.string().nullable().optional(),
});

export async function requireRouteUser(
  request: NextRequest,
): Promise<{ user: RouteUser } | { response: NextResponse }> {
  const authResult = await resolveRequestUser(request);
  if ("error" in authResult) {
    return {
      response: NextResponse.json(
        {
          message: authResult.error.status === 403 ? "Forbidden" : "Unauthorized",
          reason: authResult.error.reason,
          hint: authResult.error.hint,
        },
        { status: authResult.error.status },
      ),
    };
  }
  return { user: authResult.user };
}

export async function parseJsonBody(request: NextRequest): Promise<unknown> {
  try {
    const rawBody = await request.text();
    return rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    throw new MarketingServiceError("Invalid JSON body", 400);
  }
}

export function toMarketingRouteErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: error.issues }, { status: 400 });
  }

  if (error instanceof MarketingServiceError) {
    return NextResponse.json(
      { error: error.message, ...(error.reason ? { reason: error.reason } : {}) },
      { status: error.status },
    );
  }

  console.error(`${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
