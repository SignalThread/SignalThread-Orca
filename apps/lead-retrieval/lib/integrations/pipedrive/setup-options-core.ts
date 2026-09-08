import type {
  PipedriveSetupOption,
  PipedriveStageOption
} from "@/lib/integrations/pipedrive/setup-core";

export type PipedriveSetupOptions = {
  pipelines: PipedriveSetupOption[];
  stages: PipedriveStageOption[];
  users: PipedriveSetupOption[];
};

type PipedriveListResponse = {
  success?: boolean;
  data?: Array<Record<string, unknown>>;
};

function normalizeOption(value: Record<string, unknown>): PipedriveSetupOption | null {
  const id = String(value.id ?? "").trim();
  const name = String(value.name ?? value.title ?? "").trim();
  return id && name ? { id, name } : null;
}

async function readPipedriveList(input: {
  apiDomain: string;
  accessToken: string;
  path: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await (input.fetchImpl ?? fetch)(`${input.apiDomain}${input.path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${input.accessToken}`, accept: "application/json" },
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as PipedriveListResponse;
  if (!response.ok || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error("Unable to load Pipedrive setup options.");
  }
  return payload.data;
}

/**
 * Normalizes provider responses. The caller owns the bearer token and must remain
 * server-side; this module deliberately returns only safe option metadata.
 */
export async function listPipedriveSetupOptionsWithToken(input: {
  accessToken: string;
  apiDomain: string;
  fetchImpl?: typeof fetch;
}): Promise<PipedriveSetupOptions> {
  const [pipelineRows, stageRows, userRows] = await Promise.all([
    readPipedriveList({ ...input, path: "/api/v2/pipelines?limit=500" }),
    readPipedriveList({ ...input, path: "/api/v2/stages?limit=500&sort_by=order_nr&sort_direction=asc" }),
    readPipedriveList({ ...input, path: "/api/v1/users" })
  ]);

  const pipelines = pipelineRows
    .map(normalizeOption)
    .filter((value): value is PipedriveSetupOption => Boolean(value));
  const stages = stageRows.flatMap((row) => {
    const option = normalizeOption(row);
    const pipelineId = String(row.pipeline_id ?? "").trim();
    return option && pipelineId ? [{ ...option, pipelineId }] : [];
  });
  const users = userRows
    .filter((row) => row.active_flag !== false)
    .map(normalizeOption)
    .filter((value): value is PipedriveSetupOption => Boolean(value));
  return { pipelines, stages, users };
}
