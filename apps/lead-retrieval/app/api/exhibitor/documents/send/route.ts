import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { isMissingEmailTemplatesTableError } from "@/lib/data/email-templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrowserFacingOrigin } from "@/lib/http/browser-facing-url";
import { sendDocumentWithGoogle } from "@/lib/integrations/google/document-send-service";

type SendBody = {
  documentId?: string;
  leadId?: string | null;
  recipientEmail?: string;
  templateId?: string;
  templateKey?: string;
  message?: string;
  deliveryMode?: "google" | "fallback";
  idempotencyKey?: string;
  subject?: string;
  body?: string;
};

function inferNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const cleaned = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "there";
  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function insertBeforeSignoff(body: string, block: string) {
  const signoffMatch = body.match(/\n\s*(Best,|Thanks,|Regards,|Sincerely,)\b/i);
  if (!signoffMatch || signoffMatch.index === undefined) {
    return `${body}\n\n${block}`.trim();
  }
  const idx = signoffMatch.index;
  return `${body.slice(0, idx).trimEnd()}\n\n${block}\n\n${body.slice(idx).trimStart()}`.trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDocumentShareText(input: {
  title: string;
  type: string;
  userMessage: string;
  trackedUrl: string;
}) {
  const lines = [
    `Item: ${input.title}`,
    `Type: ${input.type}`,
    input.userMessage ? `Message: ${input.userMessage}` : null,
    `Open item: ${input.trackedUrl}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function renderDocumentShareHtml(input: {
  title: string;
  type: string;
  userMessage: string;
  trackedUrl: string;
}) {
  const title = escapeHtml(input.title);
  const type = escapeHtml(input.type);
  const message = escapeHtml(input.userMessage);
  const trackedUrl = escapeHtml(input.trackedUrl);
  return `
    <div style="margin:24px 0;padding:18px;border:1px solid #dfe5ef;border-radius:12px;background:#f8fafc;font-family:Arial,sans-serif;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Item</p>
      <h2 style="margin:0 0 8px;font-size:18px;line-height:1.35;color:#0f172a;">${title}</h2>
      <p style="margin:0 0 14px;font-size:14px;color:#475569;">${type}</p>
      ${message ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#334155;">${message}</p>` : ""}
      <a href="${trackedUrl}" style="display:inline-block;border-radius:10px;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 16px;">Open item</a>
    </div>
  `.trim();
}

function renderBasePlaceholders(input: {
  templateText: string;
  recipientName: string;
  repName: string;
  companyName: string;
  eventName: string;
}) {
  const { templateText, recipientName, repName, companyName, eventName } = input;
  const source = String(templateText ?? "").trim();
  return source
    .replaceAll("{{lead_name}}", recipientName)
    .replaceAll("{{rep_name}}", repName)
    .replaceAll("{{company_name}}", companyName)
    .replaceAll("{{event_name}}", eventName);
}

function renderTemplateBody(input: {
  templateText: string;
  recipientName: string;
  repName: string;
  companyName: string;
  eventName: string;
  documentsListText: string;
  userMessage: string;
  trackedUrl: string;
}) {
  const {
    templateText,
    recipientName,
    repName,
    companyName,
    eventName,
    documentsListText,
    userMessage,
    trackedUrl,
  } = input;
  const source = String(templateText ?? "").trim();
  const hasDocumentsPlaceholder = source.includes("{{documents_list}}");
  const hasTrackedUrlPlaceholder = source.includes("{{tracked_url}}");
  const hasUserMessagePlaceholder =
    source.includes("{{user_message}}") ||
    source.includes("{{custom_message}}") ||
    source.includes("{{optional_message}}") ||
    source.includes("{{personal_message}}");

  let rendered = renderBasePlaceholders({
    templateText,
    recipientName,
    repName,
    companyName,
    eventName,
  })
    .replaceAll("{{documents_list}}", documentsListText)
    .replaceAll("{{tracked_url}}", trackedUrl)
    .replaceAll("{{user_message}}", userMessage)
    .replaceAll("{{custom_message}}", userMessage)
    .replaceAll("{{optional_message}}", userMessage)
    .replaceAll("{{personal_message}}", userMessage);

  if (!hasDocumentsPlaceholder) {
    rendered = insertBeforeSignoff(rendered, `Resources:\n${documentsListText}`);
  }

  if (userMessage && !hasUserMessagePlaceholder) {
    rendered = insertBeforeSignoff(rendered, `Additional note:\n${userMessage}`);
  }

  if (!hasTrackedUrlPlaceholder) {
    rendered = `${rendered.trim()}\n\nView resources:\n${trackedUrl}`;
  }

  return rendered.trim();
}

function renderTemplateHtml(input: {
  templateText: string;
  recipientName: string;
  repName: string;
  companyName: string;
  eventName: string;
  documentShareHtml: string;
}) {
  const source = renderBasePlaceholders({
    templateText: String(input.templateText ?? "").trim(),
    recipientName: input.recipientName,
    repName: input.repName,
    companyName: input.companyName,
    eventName: input.eventName,
  })
    .replaceAll("{{tracked_url}}", "")
    .replaceAll("{{user_message}}", "")
    .replaceAll("{{custom_message}}", "")
    .replaceAll("{{optional_message}}", "")
    .replaceAll("{{personal_message}}", "");

  const renderParagraphs = (text: string) =>
    text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#334155;">${escapeHtml(part).replaceAll("\n", "<br>")}</p>`)
    .join("");

  if (source.includes("{{documents_list}}")) {
    const [before, ...afterParts] = source.split("{{documents_list}}");
    return `${renderParagraphs(before)}${input.documentShareHtml}${renderParagraphs(afterParts.join(" "))}`;
  }

  return `${renderParagraphs(source)}${input.documentShareHtml}`;
}

function isSimpleValidEmail(value: string) {
  const at = value.indexOf("@");
  if (at <= 0) return false;
  const dot = value.indexOf(".", at + 2);
  return dot > at + 1 && dot < value.length - 1;
}

function isMissingDocumentsTableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation \"documents\" does not exist") ||
    message.includes("relation \"document_sends\" does not exist")
  );
}

export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();

    if (role !== "exhibitor_admin" && role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const accountId = String(sessionUser.companyId ?? "").trim();
    if (!accountId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const payload = (await request.json().catch(() => null)) as SendBody | null;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const documentId = String(payload.documentId ?? "").trim();
    const recipientEmail = String(payload.recipientEmail ?? "").trim();
    const leadId = String(payload.leadId ?? "").trim();
    const templateId = String(payload.templateId ?? payload.templateKey ?? "").trim();

    if (payload.deliveryMode === "google") {
      const result = await sendDocumentWithGoogle({
        userId: String(sessionUser.userId ?? ""),
        companyId: accountId,
        role,
        isBearer: /^Bearer\s/i.test(request.headers.get("authorization") ?? ""),
        activePlatformAdminCompanyId: sessionUser.activeCompanyId,
        leadId,
        documentId,
        idempotencyKey: String(payload.idempotencyKey ?? ""),
        subject: String(payload.subject ?? ""),
        body: String(payload.body ?? ""),
        browserOrigin: getBrowserFacingOrigin(request)
      });
      const status = result.ok
        ? 200
        : result.outcome === "invalid_input" || result.outcome === "missing_email"
          ? 400
          : result.outcome === "unauthorized"
            ? 403
            : result.outcome === "lead_not_found" || result.outcome === "document_not_found"
              ? 404
              : result.outcome === "missing_connection" ||
                  result.outcome === "reconnect_required" ||
                  result.outcome === "provider_selection_required"
                ? 409
                : result.outcome === "unknown"
                  ? 202
                  : 502;
      return NextResponse.json({
        ...result,
        success: result.ok,
        provider: result.activity?.provider ?? null,
        message: result.ok ? "Email sent." : undefined
      }, { status });
    }

    console.log("[documents/send] request", {
      accountId,
      userId: sessionUser.userId,
      hasLeadId: Boolean(leadId),
      hasDocumentId: Boolean(documentId),
      hasRecipientEmail: Boolean(recipientEmail),
    });

    if (!documentId) {
      return NextResponse.json({ error: "Document is required." }, { status: 400 });
    }
    if (!recipientEmail || !isSimpleValidEmail(recipientEmail)) {
      return NextResponse.json({ error: "Valid recipient email is required." }, { status: 400 });
    }
    if (!templateId) {
      return NextResponse.json({ error: "Email template is required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: documentRow, error: documentError } = await (supabase as any)
      .from("documents")
      .select("id, account_id, title, type, asset_kind, rep_sendable, sent_count")
      .eq("id", documentId)
      .eq("account_id", accountId)
      .eq("is_archived", false)
      .maybeSingle();

    if (documentError || !documentRow) {
      if (isMissingDocumentsTableError(documentError)) {
        return NextResponse.json(
          {
            error:
              "Documents & Links Hub is not initialized in this environment yet. Apply the documents migration before sending items.",
            fallback: true,
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: documentError?.message ?? "Item not found." }, { status: 404 });
    }

    if (!documentRow.rep_sendable) {
      return NextResponse.json(
        { error: "This item is internal only and cannot be sent by reps." },
        { status: 400 }
      );
    }

    const { data: templateRow, error: templateError } = await (supabase as any)
      .from("email_templates")
      .select("id, account_id, name, subject, body")
      .eq("id", templateId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (templateError || !templateRow) {
      if (isMissingEmailTemplatesTableError(templateError)) {
        return NextResponse.json(
          {
            error:
              "Email templates are not initialized in this environment yet. Apply the email templates migration before sending resources.",
            fallback: true,
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: templateError?.message ?? "Selected email template was not found." },
        { status: 404 }
      );
    }

    // MVP: create tracked send records now; provider delivery (SendGrid) plugs in later.
    const { data: sendRow, error: sendError } = await (supabase as any)
      .from("document_sends")
      .insert({
        document_id: documentRow.id,
        lead_id: leadId || null,
        recipient_email: recipientEmail,
        sent_by: sessionUser.userId,
        provider_message_id: null,
      })
      .select("id, created_at")
      .maybeSingle();

    if (sendError || !sendRow) {
      console.log("[documents/send] insert_failed", {
        accountId,
        userId: sessionUser.userId,
        documentId: documentRow.id,
        leadId: leadId || null,
        error: sendError?.message ?? "Unknown error",
      });
      if (isMissingDocumentsTableError(sendError)) {
        return NextResponse.json(
          {
            error:
              "Documents & Links Hub is not initialized in this environment yet. Apply the documents migration before sending items.",
            fallback: true,
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: sendError?.message ?? "Failed to create send record." }, { status: 500 });
    }

    const currentSentCount = Number(documentRow.sent_count ?? 0);
    const { error: countError } = await (supabase as any)
      .from("documents")
      .update({
        sent_count: currentSentCount + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentRow.id)
      .eq("account_id", accountId);

    if (countError) {
      console.error("[documents/send] failed incrementing sent_count", {
        documentId: documentRow.id,
        accountId,
        error: countError.message ?? "Unknown error",
      });
    }

    const trackedUrl = `${new URL(request.url).origin}/api/exhibitor/documents/sends/${sendRow.id}/click`;

    const sendGridApiKey = process.env.SENDGRID_API_KEY?.trim();
    const fromEmail = process.env.EMAIL_FROM?.trim();
    if (!sendGridApiKey) {
      throw new Error("Missing SENDGRID_API_KEY.");
    }
    if (!fromEmail) {
      throw new Error("Missing EMAIL_FROM.");
    }

    const templateName = String(templateRow.name ?? "").trim() || null;
    const userMessage = String(payload.message ?? "").trim();

    const [{ data: companyRow }, leadLookupResult] = await Promise.all([
      (supabase as any).from("companies").select("name").eq("id", accountId).maybeSingle(),
      leadId
        ? (supabase as any)
            .from("leads")
            .select("id, full_name, event_id")
            .eq("id", leadId)
            .eq("company_id", accountId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    let eventName = "your event";
    const leadEventId = String(leadLookupResult?.data?.event_id ?? "").trim();
    if (leadEventId) {
      const { data: eventRow } = await (supabase as any)
        .from("events")
        .select("name")
        .eq("id", leadEventId)
        .maybeSingle();
      const candidateEventName = String(eventRow?.name ?? "").trim();
      if (candidateEventName) {
        eventName = candidateEventName;
      }
    }

    const recipientName =
      String(leadLookupResult?.data?.full_name ?? "").trim() || inferNameFromEmail(recipientEmail);
    const { data: senderUserRow } = await (supabase as any)
      .from("users")
      .select("full_name")
      .eq("id", sessionUser.userId)
      .maybeSingle();
    const repName = String(senderUserRow?.full_name ?? "").trim() || "SignalThread Team";
    const companyName = String(companyRow?.name ?? "").trim() || "SignalThread Lead Retrieval";
    const documentsListText = renderDocumentShareText({
      title: String(documentRow.title ?? "").trim() || "Document",
      type: String(documentRow.type ?? "").trim() || "Resource",
      userMessage: "",
      trackedUrl,
    });

    const subject = renderBasePlaceholders({
      templateText: String(templateRow.subject ?? "").trim() || "Resources from {{company_name}}",
      recipientName,
      repName,
      companyName,
      eventName,
    });

    const textBody = renderTemplateBody({
      templateText: String(templateRow.body ?? "").trim(),
      recipientName,
      repName,
      companyName,
      eventName,
      documentsListText,
      userMessage,
      trackedUrl,
    });
    const htmlBody = renderTemplateHtml({
      templateText: String(templateRow.body ?? "").trim(),
      recipientName,
      repName,
      companyName,
      eventName,
      documentShareHtml: renderDocumentShareHtml({
        title: String(documentRow.title ?? "").trim() || "Document",
        type: String(documentRow.type ?? "").trim() || "Resource",
        userMessage,
        trackedUrl,
      }),
    });

    sgMail.setApiKey(sendGridApiKey);

    let providerStatusCode: number | null = null;
    try {
      const [providerResponse] = await sgMail.send({
        to: recipientEmail,
        from: fromEmail,
        subject,
        text: textBody,
        html: htmlBody,
      });

      providerStatusCode = providerResponse?.statusCode ?? null;
    } catch (providerError) {
      console.error("DOCUMENTS_SEND_PROVIDER_ERROR", {
        category: "provider_failure",
      });
      throw providerError;
    }

    const routeResponse = {
      success: true,
      documentId: documentRow.id,
      sendId: sendRow.id,
      trackedUrl,
      queued: true,
      provider: "sendgrid",
      message: "Email sent.",
      templateId: templateRow.id,
      templateName,
      userMessage: userMessage || null,
    };

    return NextResponse.json(routeResponse);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("DOCUMENTS_SEND_PROVIDER_ERROR", {
      category: "document_send_failure",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
