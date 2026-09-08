import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import {
  deleteEmailTemplateForAccount,
  emailTemplateColumns,
  isMissingEmailTemplatesTableError,
  setDefaultEmailTemplate,
} from "@/lib/data/email-templates";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type UpdateTemplateBody = {
  name?: string;
  subject?: string;
  body?: string;
  isDefault?: boolean;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
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

    const { templateId: rawTemplateId } = await params;
    const templateId = String(rawTemplateId ?? "").trim();
    if (!templateId) {
      return NextResponse.json({ error: "Missing template id." }, { status: 400 });
    }

    const payload = (await request.json().catch(() => null)) as UpdateTemplateBody | null;
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
    const { data: updatedTemplate, error: updateError } = await (supabase as any)
      .from("email_templates")
      .update({
        name,
        subject,
        body,
        is_default: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId)
      .eq("account_id", accountId)
      .select(emailTemplateColumns)
      .maybeSingle();

    if (updateError || !updatedTemplate) {
      if (isMissingEmailTemplatesTableError(updateError)) {
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
        { error: updateError?.message ?? "Template not found." },
        { status: 404 }
      );
    }

    if (isDefault) {
      const { error: defaultError } = await setDefaultEmailTemplate(
        supabase,
        accountId,
        templateId
      );

      if (defaultError) {
        return NextResponse.json(
          { error: defaultError.message ?? "Template updated but failed setting default." },
          { status: 500 }
        );
      }

      updatedTemplate.is_default = true;
    }

    return NextResponse.json({ template: updatedTemplate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
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

    const { templateId: rawTemplateId } = await params;
    const templateId = String(rawTemplateId ?? "").trim();
    if (!templateId) {
      return NextResponse.json({ error: "Missing template id." }, { status: 400 });
    }

    const supabase = createAdminClient();

    const result = await deleteEmailTemplateForAccount(supabase, accountId, templateId);
    if (!result.ok) {
      if (isMissingEmailTemplatesTableError(result.error)) {
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
        { error: result.error?.message ?? (result.status === 404 ? "Template not found." : "Failed deleting template.") },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { success: true, templates: result.templates },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
