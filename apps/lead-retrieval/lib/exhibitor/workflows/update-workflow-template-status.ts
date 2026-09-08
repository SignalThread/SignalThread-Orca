type WorkflowStatusExistingRow = {
  id: string;
  company_id: string;
  event_id: string | null;
  is_enabled: boolean;
};

export type UpdateWorkflowTemplateStatusArgs = {
  workflowId: string;
  companyId: string | null;
  eventIdForScope?: string | null;
  isEnabled: boolean;
  isPlatformAdmin?: boolean;
};

export type UpdateWorkflowTemplateStatusResult =
  | {
      ok: true;
      workflowId: string;
      isEnabled: boolean;
    }
  | {
      ok: false;
      status: 400 | 404 | 500;
      error: string;
    };

function normalizeNullableId(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function formatSupabaseError(error: { message: string; code?: string } | null | undefined): string {
  if (!error) return "Unknown database error.";
  return `${error.message} (${error.code ?? "no_code"})`;
}

export async function updateWorkflowTemplateStatusForScope(
  supabase: {
    from: (table: string) => unknown;
  },
  args: UpdateWorkflowTemplateStatusArgs
): Promise<UpdateWorkflowTemplateStatusResult> {
  const workflowId = normalizeNullableId(args.workflowId);
  const companyId = normalizeNullableId(args.companyId);
  const eventIdForScope = normalizeNullableId(args.eventIdForScope);
  const isPlatformAdmin = args.isPlatformAdmin === true;

  if (!workflowId) {
    return { ok: false, status: 400, error: "Missing workflow status scope." };
  }

  if (!companyId && !isPlatformAdmin) {
    return { ok: false, status: 400, error: "Missing exhibitor scope." };
  }

  let lookupQuery: any = (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => unknown;
      };
    };
  })
    .from("workflow_templates")
    .select("id, company_id, event_id, is_enabled")
    .eq("id", workflowId);

  if (companyId) {
    lookupQuery = lookupQuery.eq("company_id", companyId);
  }

  const { data: existing, error: lookupError } = (await lookupQuery.maybeSingle()) as {
    data: WorkflowStatusExistingRow | null;
    error: { message: string; code?: string } | null;
  };

  if (lookupError) {
    return { ok: false, status: 500, error: formatSupabaseError(lookupError) };
  }

  if (!existing) {
    return { ok: false, status: 404, error: "Workflow not found." };
  }

  if (eventIdForScope && existing.event_id && existing.event_id !== eventIdForScope) {
    return { ok: false, status: 404, error: "Workflow not found." };
  }

  type WorkflowTemplateStatusUpdateQuery = {
    eq: (col: string, val: string) => WorkflowTemplateStatusUpdateQuery;
  };
  let updateQuery: WorkflowTemplateStatusUpdateQuery = (supabase as unknown as {
    from: (table: string) => {
      update: (patch: { is_enabled: boolean }) => {
        eq: (col: string, val: string) => WorkflowTemplateStatusUpdateQuery;
      };
    };
  })
    .from("workflow_templates")
    .update({ is_enabled: args.isEnabled })
    .eq("id", existing.id)
    .eq("company_id", existing.company_id);

  if (eventIdForScope && existing.event_id) {
    updateQuery = updateQuery.eq("event_id", eventIdForScope);
  }

  const { error: updateError } = (await updateQuery as unknown) as {
    error: { message: string; code?: string } | null;
  };

  if (updateError) {
    return { ok: false, status: 500, error: formatSupabaseError(updateError) };
  }

  return { ok: true, workflowId: existing.id, isEnabled: args.isEnabled };
}
