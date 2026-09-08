/**
 * Server loader for the Workflows list page.
 *
 * Scope rules (mirrors `lib/workflows/emit/trigger-resolver.ts` semantics so the list
 * reflects what would actually run for the current event context):
 *
 *   - Always filtered to `workflow_templates.company_id = <caller company>`.
 *   - When an `activeEventId` is provided, return templates whose pin is either:
 *       * `event_id IS NULL` (matches all events of the matching scope), OR
 *       * `event_id = activeEventId`.
 *     This keeps the list relevant to the chosen container without hiding company-wide
 *     templates that would also fire for it.
 *   - When no `activeEventId` is provided (account-level callers, future), return all
 *     company-scoped templates.
 *
 * Ordering: `updated_at desc`, then `created_at desc`.
 *
 * Performance: one query for templates, one for steps (filtered to the returned ids),
 * one for the latest `workflow_runs.created_at` per template (filtered to the same
 * ids). All three are bounded by the number of templates a company has, which is
 * small.
 *
 * RLS: the loader is invoked from a server component using the user's authenticated
 * `createSupabaseServerClient`. The existing `workflow_templates_select_scope` and
 * `workflow_steps_select_scope` policies enforce company scoping at the DB layer; the
 * `company_id` filter here is defense-in-depth.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  WorkflowScope,
  WorkflowTriggerEvent
} from "@/lib/workflows/contracts/workflow-types";

/**
 * Matches the concrete return type of {@link createSupabaseServerClient}. Using the
 * derived type (rather than the bare `SupabaseClient` from `@supabase/supabase-js`)
 * avoids a generic-arity mismatch between `@supabase/ssr`'s pinned peer and the
 * top-level `@supabase/supabase-js` we install for client-side helpers.
 *
 * `import type` is erased at compile time so this does not pull `next/headers` into
 * unit tests that import this module.
 */
type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
import type {
  WorkflowTemplateListRow,
  WorkflowTemplateStepSummary
} from "./workflow-list-types";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  scope: string;
  event_id: string | null;
  is_enabled: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type StepRow = {
  template_id: string;
  step_index: number;
  step_type: string;
  step_key: string;
  requires_approval: boolean;
};

type RunCreatedRow = {
  template_id: string;
  created_at: string;
};

export type LoadWorkflowTemplatesArgs = {
  companyId: string;
  /** Active event id from `resolveExhibitorAppActiveEventId`. Null for account-level. */
  activeEventId: string | null;
};

export async function loadWorkflowTemplatesForList(
  supabase: SupabaseServerClient,
  args: LoadWorkflowTemplatesArgs
): Promise<WorkflowTemplateListRow[]> {
  const companyId = String(args.companyId ?? "").trim();
  if (!companyId) return [];

  // 1. Templates scoped to company + (event pin allowed).
  let templateQuery = (
    supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: unknown) => {
            is: (col: string, val: unknown) => Record<string, unknown>;
          };
        };
      };
    }
  )
    .from("workflow_templates")
    .select(
      "id, name, description, trigger_event, scope, event_id, is_enabled, version, created_by, created_at, updated_at"
    )
    .eq("company_id", companyId) as unknown as {
    or: (clause: string) => unknown;
    order: (col: string, opts: { ascending: boolean }) => unknown;
  };

  if (args.activeEventId) {
    templateQuery = (
      templateQuery as unknown as { or: (clause: string) => typeof templateQuery }
    ).or(`event_id.is.null,event_id.eq.${args.activeEventId}`);
  }

  const ordered = (templateQuery as unknown as {
    order: (col: string, opts: { ascending: boolean }) => {
      order: (col: string, opts: { ascending: boolean }) => Promise<{
        data: TemplateRow[] | null;
        error: { message: string } | null;
      }>;
    };
  })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: templates, error: templateError } = await ordered;
  if (templateError) {
    console.warn("[loadWorkflowTemplatesForList] template query failed", {
      message: templateError.message
    });
    return [];
  }
  const templateRows = templates ?? [];
  if (templateRows.length === 0) return [];

  const templateIds = templateRows.map((row) => row.id);

  // 2. Steps for these templates.
  const { data: steps, error: stepsError } = (await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        in: (col: string, vals: unknown[]) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: StepRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  })
    .from("workflow_steps")
    .select("template_id, step_index, step_type, step_key, requires_approval")
    .in("template_id", templateIds)
    .order("step_index", { ascending: true })) as {
    data: StepRow[] | null;
    error: { message: string } | null;
  };

  if (stepsError) {
    console.warn("[loadWorkflowTemplatesForList] step query failed", {
      message: stepsError.message
    });
  }

  const stepsByTemplate = new Map<string, WorkflowTemplateStepSummary[]>();
  for (const row of steps ?? []) {
    const list = stepsByTemplate.get(row.template_id) ?? [];
    list.push({
      step_index: row.step_index,
      step_type: row.step_type,
      step_key: row.step_key,
      requires_approval: row.requires_approval
    });
    stepsByTemplate.set(row.template_id, list);
  }

  // 3. Latest run per template. We pull `template_id, created_at` for any run row of
  // this template set, then reduce to the max in-memory. (PostgREST does not support
  // GROUP BY MAX directly via the client; doing it server-side via a view would be
  // premature.) Bounded by recent runs for these templates.
  const { data: runs, error: runsError } = (await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        in: (col: string, vals: unknown[]) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: RunCreatedRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("workflow_runs")
    .select("template_id, created_at")
    .in("template_id", templateIds)
    .order("created_at", { ascending: false })
    .limit(1000)) as {
    data: RunCreatedRow[] | null;
    error: { message: string } | null;
  };

  if (runsError) {
    console.warn("[loadWorkflowTemplatesForList] runs query failed", {
      message: runsError.message
    });
  }

  const lastRunAtByTemplate = new Map<string, string>();
  for (const run of runs ?? []) {
    if (!lastRunAtByTemplate.has(run.template_id)) {
      lastRunAtByTemplate.set(run.template_id, run.created_at);
    }
  }

  // 4. Assemble.
  return templateRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    trigger_event: row.trigger_event as WorkflowTriggerEvent,
    scope: row.scope as WorkflowScope,
    event_id: row.event_id,
    is_enabled: row.is_enabled,
    version: row.version,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    steps: stepsByTemplate.get(row.id) ?? [],
    last_run_at: lastRunAtByTemplate.get(row.id) ?? null
  }));
}
