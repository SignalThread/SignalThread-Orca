import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import {
  emailTemplateColumns,
  fetchEmailTemplatesForAccount,
  isMissingEmailTemplatesTableError,
  setDefaultEmailTemplate,
} from "@/lib/data/email-templates";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CreateTemplateBody = {
  name?: string;
  subject?: string;
  body?: string;
  isDefault?: boolean;
};

export async function GET() {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isCompanyAccountAdminSession(sessionUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const accountId = String(sessionUser.company_id ?? "").trim();
    if (!accountId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { templates, error } = await fetchEmailTemplatesForAccount(supabase, accountId);

    if (error) {
      if (isMissingEmailTemplatesTableError(error)) {
        return NextResponse.json(
          {
            error:
              "Email templates are not initialized in this environment yet. Apply the email templates migration.",
            fallback: true,
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: error.message ?? "Failed loading email templates." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { templates },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isCompanyAccountAdminSession(sessionUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const accountId = String(sessionUser.company_id ?? "").trim();
    if (!accountId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const payload = (await request.json().catch(() => null)) as CreateTemplateBody | null;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const name = String(payload.name ?? "").trim();
    const subject = String(payload.subject ?? "").trim();
    const body = String(payload.body ?? "").trim();
    const isDefault = Boolean(payload.isDefault);

    if (!name || !subject || !body) {
      return NextResponse.json(
        { error: "Template name, subject, and body are required." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: insertedTemplate, error: insertError } = await (supabase as any)
      .from("email_templates")
      .insert({
        account_id: accountId,
        name,
        subject,
        body,
        is_default: false,
      })
      .select(emailTemplateColumns)
      .maybeSingle();

    if (insertError || !insertedTemplate) {
      if (isMissingEmailTemplatesTableError(insertError)) {
        return NextResponse.json(
          {
            error:
              "Email templates are not initialized in this environment yet. Apply the email templates migration.",
            fallback: true,
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: insertError?.message ?? "Failed creating template." },
        { status: 500 }
      );
    }

    if (isDefault) {
      const { error: defaultError } = await setDefaultEmailTemplate(
        supabase,
        accountId,
        insertedTemplate.id
      );

      if (defaultError) {
        return NextResponse.json(
          { error: defaultError.message ?? "Template created but failed setting default." },
          { status: 500 }
        );
      }

      insertedTemplate.is_default = true;
    }

    return NextResponse.json({ template: insertedTemplate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
