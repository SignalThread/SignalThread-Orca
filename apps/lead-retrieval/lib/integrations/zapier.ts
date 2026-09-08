import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ZapierPayload = Record<string, unknown>;

export async function sendZapierWebhook(accountId: string, payload: ZapierPayload) {
  const normalizedAccountId = String(accountId ?? "").trim();
  if (!normalizedAccountId) {
    return { ok: false, skipped: true as const, reason: "missing_account_id" as const };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("companies")
      .select("zapier_webhook_url")
      .eq("id", normalizedAccountId)
      .maybeSingle();

    if (error) {
      console.error("[zapier] failed loading webhook url", {
        accountId: normalizedAccountId,
        message: error.message,
        code: error.code
      });
      return { ok: false, skipped: true as const, reason: "load_failed" as const };
    }

    const webhookUrl = String(data?.zapier_webhook_url ?? "").trim();
    if (!webhookUrl) {
      return { ok: false, skipped: true as const, reason: "missing_webhook" as const };
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.warn("[zapier] webhook request returned non-2xx", {
        accountId: normalizedAccountId,
        status: response.status,
        responseText: responseText.slice(0, 500)
      });
      return { ok: false, skipped: false as const, reason: "non_2xx" as const, status: response.status };
    }

    return { ok: true, skipped: false as const };
  } catch (error) {
    console.error("[zapier] webhook request failed", {
      accountId: normalizedAccountId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { ok: false, skipped: true as const, reason: "request_failed" as const };
  }
}
