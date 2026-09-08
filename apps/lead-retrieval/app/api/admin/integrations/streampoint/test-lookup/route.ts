import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPersonByConfirmationId,
  StreampointClientError
} from "@/lib/integrations/streampoint/client";

export const runtime = "nodejs";

type LookupPayload = {
  confirmationId?: string;
  eventId?: string;
};

type EventRegistrationRow = {
  id: string;
  company_id: string | null;
};

type ProviderConfigRow = {
  api_token: string | null;
  api_base_url: string | null;
  environment: string | null;
  is_enabled: boolean | null;
};

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (sessionUser.role !== "platform_admin") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as LookupPayload;
    const confirmationId = String(payload.confirmationId ?? "").trim();
    const eventId = String(payload.eventId ?? "").trim();
    if (!confirmationId) {
      return NextResponse.json(
        { success: false, error: "confirmationId is required" },
        { status: 400 }
      );
    }
    if (!eventId) {
      return NextResponse.json(
        { success: false, error: "eventId is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data: eventData, error: eventError } = await (adminClient as any)
      .from("events")
      .select("id, company_id")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      return NextResponse.json(
        { success: false, error: "Failed to load event scope." },
        { status: 500 }
      );
    }

    const eventRow = (eventData as EventRegistrationRow | null) ?? null;
    if (!eventRow?.id || !eventRow.company_id) {
      return NextResponse.json(
        { success: false, error: "No active Streampoint configuration found for this event." },
        { status: 400 }
      );
    }

    const { data: providerConfigData, error: providerConfigError } = await (adminClient as any)
      .from("registration_provider_configs")
      .select("api_token, api_base_url, environment, is_enabled")
      .eq("account_id", eventRow.company_id)
      .eq("provider", "streampoint")
      .maybeSingle();

    if (providerConfigError) {
      return NextResponse.json(
        { success: false, error: "Failed to load registration provider configuration." },
        { status: 500 }
      );
    }

    const providerConfig = (providerConfigData as ProviderConfigRow | null) ?? null;
    if (!providerConfig) {
      return NextResponse.json(
        { success: false, error: "Registration provider is not mapped to Streampoint for this event." },
        { status: 400 }
      );
    }

    if (providerConfig && providerConfig.is_enabled === false) {
      return NextResponse.json(
        { success: false, error: "Streampoint is configured for this event but currently disabled." },
        { status: 400 }
      );
    }

    const resolvedApiToken = String(providerConfig.api_token ?? "").trim();
    const resolvedBaseUrl = String(providerConfig.api_base_url ?? "").trim();
    const resolvedEnvironment = String(providerConfig.environment ?? "").trim() || null;

    if (!resolvedApiToken || !resolvedBaseUrl) {
      return NextResponse.json(
        { success: false, error: "No active Streampoint configuration found for this event." },
        { status: 400 }
      );
    }

    const person = await getPersonByConfirmationId(confirmationId, {
      apiToken: resolvedApiToken,
      baseUrl: resolvedBaseUrl,
      environment: resolvedEnvironment
    });
    return NextResponse.json({ success: true, person });
  } catch (error) {
    if (error instanceof StreampointClientError) {
      if (error.code === "INVALID_CONFIRMATION_ID" || error.code === "NOT_FOUND") {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      if (error.code === "HTTP_ERROR") {
        return NextResponse.json(
          { success: false, error: "Streampoint lookup failed. Please verify provider credentials and confirmation ID." },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { success: false, error: error.message || "Streampoint lookup failed." },
        { status: 500 }
      );
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
