import type { WorkflowStepInsertRow, WorkflowTemplateInsertRow } from "./create-workflow-core";

type WorkflowTemplateInsertResult = { id: string } | null;
type WorkflowTemplateUpdatePatch = Pick<
  WorkflowTemplateInsertRow,
  "name" | "is_enabled" | "trigger_conditions_jsonb"
>;

export async function persistWorkflowTemplateAndSteps(
  supabase: {
    from: (table: string) => {
      insert: (row: WorkflowTemplateInsertRow | WorkflowStepInsertRow[]) => {
        select?: (cols: string) => {
          maybeSingle: () => Promise<{
            data: WorkflowTemplateInsertResult;
            error: { message: string } | null;
          }>;
        };
      };
    };
  },
  args: {
    templateRow: WorkflowTemplateInsertRow;
    stepBodies: Omit<WorkflowStepInsertRow, "template_id">[];
  }
): Promise<
  | { ok: true; templateId: string }
  | { ok: false; stage: "template" | "steps"; error: string }
> {
  const { data: insertedTpl, error: tplErr } = await (supabase as unknown as {
    from: (t: string) => {
      insert: (row: WorkflowTemplateInsertRow) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("workflow_templates")
    .insert(args.templateRow)
    .select("id")
    .maybeSingle();

  if (tplErr || !insertedTpl?.id) {
    return {
      ok: false,
      stage: "template",
      error: tplErr?.message ?? "Failed to create workflow."
    };
  }

  const templateId = insertedTpl.id;
  const stepsPayload: WorkflowStepInsertRow[] = args.stepBodies.map((s) => ({
    ...s,
    template_id: templateId
  }));

  if (stepsPayload.length === 0) {
    return { ok: true, templateId };
  }

  const { error: stepErr } = await (supabase as unknown as {
    from: (t: string) => {
      insert: (rows: WorkflowStepInsertRow[]) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from("workflow_steps")
    .insert(stepsPayload);

  if (stepErr) {
    await (supabase as unknown as {
      from: (t: string) => {
        delete: () => { eq: (col: string, val: string) => Promise<unknown> };
      };
    })
      .from("workflow_templates")
      .delete()
      .eq("id", templateId);

    return {
      ok: false,
      stage: "steps",
      error: stepErr.message ?? "Failed to create workflow steps."
    };
  }

  return { ok: true, templateId };
}

export async function replaceWorkflowTemplateConfigAndSteps(
  supabase: {
    from: (table: string) => unknown;
  },
  args: {
    workflowId: string;
    companyId: string;
    templatePatch: WorkflowTemplateUpdatePatch;
    stepBodies: Omit<WorkflowStepInsertRow, "template_id">[];
  }
): Promise<
  | { ok: true; templateId: string }
  | { ok: false; stage: "template_lookup" | "template" | "steps_delete" | "steps"; error: string }
> {
  const { data: existing, error: lookupErr } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
          };
        };
      };
    };
  })
    .from("workflow_templates")
    .select("id")
    .eq("id", args.workflowId)
    .eq("company_id", args.companyId)
    .maybeSingle();

  if (lookupErr || !existing?.id) {
    return {
      ok: false,
      stage: "template_lookup",
      error: lookupErr?.message ?? "Workflow not found."
    };
  }

  const { error: tplErr } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: WorkflowTemplateUpdatePatch) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  })
    .from("workflow_templates")
    .update(args.templatePatch)
    .eq("id", args.workflowId)
    .eq("company_id", args.companyId);

  if (tplErr) {
    return {
      ok: false,
      stage: "template",
      error: tplErr.message ?? "Failed to update workflow."
    };
  }

  const { error: deleteErr } = await (supabase as unknown as {
    from: (t: string) => {
      delete: () => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_steps")
    .delete()
    .eq("template_id", args.workflowId);

  if (deleteErr) {
    return {
      ok: false,
      stage: "steps_delete",
      error: deleteErr.message ?? "Failed to replace workflow steps."
    };
  }

  const stepsPayload: WorkflowStepInsertRow[] = args.stepBodies.map((s) => ({
    ...s,
    template_id: args.workflowId
  }));

  if (stepsPayload.length === 0) {
    return { ok: true, templateId: args.workflowId };
  }

  const { error: stepErr } = await (supabase as unknown as {
    from: (t: string) => {
      insert: (rows: WorkflowStepInsertRow[]) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from("workflow_steps")
    .insert(stepsPayload);

  if (stepErr) {
    return {
      ok: false,
      stage: "steps",
      error: stepErr.message ?? "Failed to save workflow steps."
    };
  }

  return { ok: true, templateId: args.workflowId };
}
