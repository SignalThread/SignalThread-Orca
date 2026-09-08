type WorkflowDeleteExistingRow = {
  id: string;
  company_id: string;
  event_id: string | null;
  created_by: string | null;
};

type WorkflowRunIdRow = {
  id: string;
};

export type DeleteWorkflowTemplateArgs = {
  workflowId: string;
  /** Required for exhibitor-scoped callers. Platform admins may omit it. */
  companyId: string | null;
  /** Optional active event context from the list/detail route. Null allows any company-scoped workflow. */
  eventIdForScope?: string | null;
  isPlatformAdmin?: boolean;
};

export type DeleteWorkflowTemplateResult =
  | {
      ok: true;
      workflowId: string;
      deleted: true;
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 500;
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

async function deleteRows(
  query: unknown
): Promise<{ error: { message: string; code?: string } | null }> {
  return (await query) as { error: { message: string; code?: string } | null };
}

export async function deleteWorkflowTemplateForScope(
  supabase: {
    from: (table: string) => unknown;
  },
  args: DeleteWorkflowTemplateArgs
): Promise<DeleteWorkflowTemplateResult> {
  const workflowId = normalizeNullableId(args.workflowId);
  const companyId = normalizeNullableId(args.companyId);
  const eventIdForScope = normalizeNullableId(args.eventIdForScope);
  const isPlatformAdmin = args.isPlatformAdmin === true;

  if (!workflowId) {
    return { ok: false, status: 400, error: "Missing workflow delete scope." };
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
    .select("id, company_id, event_id, created_by")
    .eq("id", workflowId);

  if (companyId) {
    lookupQuery = lookupQuery.eq("company_id", companyId);
  }

  const { data: existing, error: lookupError } = (await lookupQuery.maybeSingle()) as {
    data: WorkflowDeleteExistingRow | null;
    error: { message: string; code?: string } | null;
  };

  if (lookupError) {
    return { ok: false, status: 500, error: formatSupabaseError(lookupError) };
  }

  if (!existing) {
    return { ok: false, status: 404, error: "Workflow not found." };
  }

  if (!existing.created_by) {
    return { ok: false, status: 403, error: "System workflows cannot be deleted." };
  }

  if (eventIdForScope && existing.event_id && existing.event_id !== eventIdForScope) {
    return { ok: false, status: 404, error: "Workflow not found." };
  }

  const { data: runRows, error: runLookupError } = (await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => unknown;
      };
    };
  })
    .from("workflow_runs")
    .select("id")
    .eq("template_id", workflowId)) as {
    data: WorkflowRunIdRow[] | null;
    error: { message: string; code?: string } | null;
  };

  if (runLookupError) {
    return { ok: false, status: 500, error: formatSupabaseError(runLookupError) };
  }

  const runIds = Array.from(new Set((runRows ?? []).map((row) => row.id).filter(Boolean)));

  if (runIds.length > 0) {
    const draftDelete = await deleteRows(
      (supabase as unknown as {
        from: (table: string) => {
          delete: () => {
            in: (col: string, vals: string[]) => unknown;
          };
        };
      })
        .from("generated_drafts")
        .delete()
        .in("run_id", runIds)
    );
    if (draftDelete.error) {
      return { ok: false, status: 500, error: formatSupabaseError(draftDelete.error) };
    }

    const stepRunDelete = await deleteRows(
      (supabase as unknown as {
        from: (table: string) => {
          delete: () => {
            in: (col: string, vals: string[]) => unknown;
          };
        };
      })
        .from("workflow_step_runs")
        .delete()
        .in("run_id", runIds)
    );
    if (stepRunDelete.error) {
      return { ok: false, status: 500, error: formatSupabaseError(stepRunDelete.error) };
    }

    const runDelete = await deleteRows(
      (supabase as unknown as {
        from: (table: string) => {
          delete: () => {
            in: (col: string, vals: string[]) => unknown;
          };
        };
      })
        .from("workflow_runs")
        .delete()
        .in("id", runIds)
    );
    if (runDelete.error) {
      return { ok: false, status: 500, error: formatSupabaseError(runDelete.error) };
    }
  }

  const stepDelete = await deleteRows(
    (supabase as unknown as {
      from: (table: string) => {
        delete: () => {
          eq: (col: string, val: string) => unknown;
        };
      };
    })
      .from("workflow_steps")
      .delete()
      .eq("template_id", workflowId)
  );
  if (stepDelete.error) {
    return { ok: false, status: 500, error: formatSupabaseError(stepDelete.error) };
  }

  let deleteQuery: any = (supabase as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (col: string, val: string) => unknown;
      };
    };
  })
    .from("workflow_templates")
    .delete()
    .eq("id", workflowId);

  deleteQuery = deleteQuery.eq("company_id", existing.company_id);

  if (eventIdForScope && existing.event_id) {
    deleteQuery = deleteQuery.eq("event_id", eventIdForScope);
  }

  const templateDelete = await deleteRows(deleteQuery);
  if (templateDelete.error) {
    return { ok: false, status: 500, error: formatSupabaseError(templateDelete.error) };
  }

  let verifyQuery: any = (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => unknown;
      };
    };
  })
    .from("workflow_templates")
    .select("id")
    .eq("id", workflowId);

  if (companyId) {
    verifyQuery = verifyQuery.eq("company_id", existing.company_id);
  }

  const { data: verified, error: verifyError } = (await verifyQuery.maybeSingle()) as {
    data: { id: string } | null;
    error: { message: string; code?: string } | null;
  };

  if (verifyError) {
    return { ok: false, status: 500, error: formatSupabaseError(verifyError) };
  }

  if (verified) {
    return { ok: false, status: 500, error: "Workflow delete did not persist." };
  }

  return { ok: true, workflowId, deleted: true };
}
