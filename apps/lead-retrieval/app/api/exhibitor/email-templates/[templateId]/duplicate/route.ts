import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import {
  emailTemplateColumns,
  isMissingEmailTemplatesTableError,
} from "@/lib/data/email-templates";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
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
    const { data: sourceTemplate, error: sourceError } = await (supabase as any)
      .from("email_templates")
      .select(emailTemplateColumns)
      .eq("id", templateId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (sourceError || !sourceTemplate) {
      if (isMissingEmailTemplatesTableError(sourceError)) {
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
        { error: sourceError?.message ?? "Template not found." },
        { status: 404 }
      );
    }

    const baseName = String(sourceTemplate.name ?? "").trim() || "Template";
    const copyName = `${baseName} (Copy)`;

    const { data: duplicatedTemplate, error: duplicateError } = await (supabase as any)
      .from("email_templates")
      .insert({
        account_id: accountId,
        name: copyName,
        subject: sourceTemplate.subject,
        body: sourceTemplate.body,
        is_default: false,
      })
      .select(emailTemplateColumns)
      .maybeSingle();

    if (duplicateError || !duplicatedTemplate) {
      return NextResponse.json(
        { error: duplicateError?.message ?? "Failed duplicating template." },
        { status: 500 }
      );
    }

    return NextResponse.json({ template: duplicatedTemplate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
