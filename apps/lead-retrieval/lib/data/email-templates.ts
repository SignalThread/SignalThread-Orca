export type EmailTemplateRow = {
  id: string;
  account_id: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_VARIABLES = [
  "{{lead_name}}",
  "{{rep_name}}",
  "{{company_name}}",
  "{{event_name}}",
  "{{documents_list}}",
] as const;

export function isMissingEmailTemplatesTableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation \"email_templates\" does not exist")
  );
}

const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: "Follow up resources",
    subject: "Resources from {{company_name}}",
    body: [
      "Hi {{lead_name}},",
      "",
      "Thanks for your time today. Sharing resources below:",
      "",
      "{{documents_list}}",
      "",
      "Best,",
      "{{rep_name}}",
    ].join("\n"),
    is_default: true,
  },
  {
    name: "Nice meeting you",
    subject: "Great meeting you at {{event_name}}",
    body: [
      "Hi {{lead_name}},",
      "",
      "It was great meeting you at {{event_name}}. Sharing a few resources that may be helpful:",
      "",
      "{{documents_list}}",
      "",
      "Let me know if you'd like to continue the conversation.",
      "",
      "Best,",
      "{{rep_name}}",
    ].join("\n"),
    is_default: false,
  },
  {
    name: "Product overview",
    subject: "Product overview",
    body: [
      "Hi {{lead_name}},",
      "",
      "Here is the product overview we discussed:",
      "",
      "{{documents_list}}",
      "",
      "Let me know if any questions come up.",
      "",
      "Best,",
      "{{rep_name}}",
    ].join("\n"),
    is_default: false,
  },
] as const;

export function getDefaultEmailTemplatePayloads(accountId: string) {
  return DEFAULT_EMAIL_TEMPLATES.map((template) => ({
    account_id: accountId,
    name: template.name,
    subject: template.subject,
    body: template.body,
    is_default: template.is_default,
  }));
}

const EMAIL_TEMPLATE_COLUMNS =
  "id, account_id, name, subject, body, is_default, created_at, updated_at";

export async function fetchEmailTemplatesForAccount(supabase: any, accountId: string) {
  const query = await supabase
    .from("email_templates")
    .select(EMAIL_TEMPLATE_COLUMNS)
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false });

  const templates = ((query.data ?? []) as EmailTemplateRow[]).map((row) => ({
    ...row,
    name: String(row.name ?? "").trim(),
    subject: String(row.subject ?? "").trim(),
    body: String(row.body ?? "").trim(),
    is_default: Boolean(row.is_default),
  }));

  return {
    templates,
    error: query.error as { message?: string; code?: string } | null,
  };
}

export async function setDefaultEmailTemplate(supabase: any, accountId: string, templateId: string) {
  const { error: clearError } = await supabase
    .from("email_templates")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .neq("id", templateId);

  if (clearError) {
    return { error: clearError as { message?: string; code?: string } };
  }

  const { error: setError } = await supabase
    .from("email_templates")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("id", templateId);

  if (setError) {
    return { error: setError as { message?: string; code?: string } };
  }

  return { error: null as null };
}

type DeleteEmailTemplateResult =
  | { ok: true; templates: EmailTemplateRow[] }
  | { ok: false; status: 404 | 500; error: { message?: string; code?: string } | null };

/**
 * Delete one account-scoped template and return the authoritative list that remains.
 *
 * Default template creation belongs to the database migration's company-insert trigger.
 * A read or delete must never recreate a template a user intentionally removed.
 */
export async function deleteEmailTemplateForAccount(
  supabase: any,
  accountId: string,
  templateId: string
): Promise<DeleteEmailTemplateResult> {
  const { data: deletedTemplate, error: deleteError } = await supabase
    .from("email_templates")
    .delete()
    .eq("id", templateId)
    .eq("account_id", accountId)
    .select("id, account_id, is_default")
    .maybeSingle();

  if (deleteError) {
    return { ok: false, status: 500, error: deleteError as { message?: string; code?: string } };
  }

  if (!deletedTemplate) {
    return { ok: false, status: 404, error: null };
  }

  let { templates, error } = await fetchEmailTemplatesForAccount(supabase, accountId);
  if (error) {
    return { ok: false, status: 500, error };
  }

  // The deleted row must not be observable from the same authoritative list path.
  if (templates.some((template) => template.id === templateId)) {
    return {
      ok: false,
      status: 500,
      error: { message: "Template deletion could not be confirmed." },
    };
  }

  if (deletedTemplate.is_default && templates[0]) {
    const { error: defaultError } = await setDefaultEmailTemplate(supabase, accountId, templates[0].id);
    if (defaultError) {
      return { ok: false, status: 500, error: defaultError };
    }

    const refreshed = await fetchEmailTemplatesForAccount(supabase, accountId);
    templates = refreshed.templates;
    error = refreshed.error;
    if (error) {
      return { ok: false, status: 500, error };
    }
  }

  return { ok: true, templates };
}

export const emailTemplateColumns = EMAIL_TEMPLATE_COLUMNS;
