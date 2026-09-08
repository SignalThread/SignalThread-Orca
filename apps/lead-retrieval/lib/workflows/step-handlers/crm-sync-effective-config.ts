import type { WorkflowCrmProviderKey } from "./crm-sync-types";

export type WorkflowCrmSyncConfigMode = "integration_default" | "override";
export type WorkflowCrmSyncRecordType = "lead" | "contact" | "campaign_member";
export type WorkflowCrmSyncMatchBehavior = "create_only" | "update_existing" | "upsert_by_email";

export type WorkflowCrmSyncConfig = {
  recordType: WorkflowCrmSyncRecordType;
  matchBehavior: WorkflowCrmSyncMatchBehavior;
  sourceLabel: string | null;
};

export type WorkflowCrmResolvedSyncConfig = WorkflowCrmSyncConfig & {
  provider: WorkflowCrmProviderKey;
  mode: WorkflowCrmSyncConfigMode;
};

const MATCH_BEHAVIOR_LABELS: Record<WorkflowCrmSyncMatchBehavior, string> = {
  create_only: "Create only",
  update_existing: "Update existing only",
  upsert_by_email: "Update by email, otherwise create"
};

const RECORD_TYPE_LABELS: Record<WorkflowCrmSyncRecordType, string> = {
  lead: "Salesforce Lead",
  contact: "HubSpot contact",
  campaign_member: "Salesforce Campaign Member"
};

export function defaultCrmSyncConfigForProvider(provider: WorkflowCrmProviderKey): WorkflowCrmSyncConfig {
  return provider === "salesforce"
    ? { recordType: "lead", matchBehavior: "upsert_by_email", sourceLabel: null }
    : { recordType: "contact", matchBehavior: "upsert_by_email", sourceLabel: null };
}

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeCrmSyncConfigMode(value: unknown): WorkflowCrmSyncConfigMode {
  return value === "override" ? "override" : "integration_default";
}

export function normalizeCrmSyncRecordType(value: unknown): WorkflowCrmSyncRecordType | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "lead" || normalized === "contact" || normalized === "campaign_member") {
    return normalized;
  }
  return null;
}

export function normalizeCrmSyncMatchBehavior(value: unknown): WorkflowCrmSyncMatchBehavior | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "create_only" || normalized === "update_existing" || normalized === "upsert_by_email") {
    return normalized;
  }
  return null;
}

export function parseWorkflowCrmSyncConfigOverride(
  raw: Record<string, unknown> | null | undefined,
  provider: WorkflowCrmProviderKey
): { mode: WorkflowCrmSyncConfigMode; override: Partial<WorkflowCrmSyncConfig> | null } {
  const mode = normalizeCrmSyncConfigMode(raw?.crmSyncConfigMode ?? raw?.crm_sync_config_mode);
  if (mode !== "override") {
    return { mode, override: null };
  }

  const fallback = defaultCrmSyncConfigForProvider(provider);
  return {
    mode,
    override: {
      recordType:
        normalizeCrmSyncRecordType(raw?.crmRecordType ?? raw?.crm_record_type) ?? fallback.recordType,
      matchBehavior:
        normalizeCrmSyncMatchBehavior(raw?.crmMatchBehavior ?? raw?.crm_match_behavior) ??
        fallback.matchBehavior,
      sourceLabel: normalizeText(raw?.crmSourceLabel ?? raw?.crm_source_label)
    }
  };
}

export function workflowCrmSyncConfigParams(input: {
  mode: WorkflowCrmSyncConfigMode;
  override: Partial<WorkflowCrmSyncConfig> | null;
}): Record<string, unknown> {
  if (input.mode !== "override" || !input.override) {
    return { crmSyncConfigMode: "integration_default" };
  }

  return {
    crmSyncConfigMode: "override",
    crmRecordType: input.override.recordType,
    crmMatchBehavior: input.override.matchBehavior,
    crmSourceLabel: input.override.sourceLabel ?? ""
  };
}

export function resolveWorkflowCrmSyncConfig(input: {
  provider: WorkflowCrmProviderKey;
  workflowMode?: WorkflowCrmSyncConfigMode | null;
  workflowOverride?: Partial<WorkflowCrmSyncConfig> | null;
  integrationDefault?: Partial<WorkflowCrmSyncConfig> | null;
}): WorkflowCrmResolvedSyncConfig {
  const safeDefault = defaultCrmSyncConfigForProvider(input.provider);
  const integrationDefault = input.integrationDefault ?? {};
  const mode = input.workflowMode === "override" ? "override" : "integration_default";
  const source = mode === "override" ? input.workflowOverride ?? {} : integrationDefault;

  return {
    provider: input.provider,
    mode,
    recordType: source.recordType ?? integrationDefault.recordType ?? safeDefault.recordType,
    matchBehavior: source.matchBehavior ?? integrationDefault.matchBehavior ?? safeDefault.matchBehavior,
    sourceLabel: source.sourceLabel ?? integrationDefault.sourceLabel ?? safeDefault.sourceLabel
  };
}

export function validateResolvedWorkflowCrmSyncConfig(
  config: WorkflowCrmResolvedSyncConfig
): { ok: true } | { ok: false; error: string } {
  if (config.provider === "salesforce") {
    if (config.recordType !== "lead") {
      return {
        ok: false,
        error: "Salesforce workflow sync currently supports Salesforce Lead records only."
      };
    }
    return { ok: true };
  }

  if (config.recordType !== "contact") {
    return {
      ok: false,
      error: "HubSpot workflow sync currently supports HubSpot contact records only."
    };
  }

  return { ok: true };
}

export function crmRecordTypeLabel(config: Pick<WorkflowCrmResolvedSyncConfig, "provider" | "recordType">): string {
  if (config.provider === "hubspot" && config.recordType === "contact") {
    return "HubSpot contact";
  }
  return RECORD_TYPE_LABELS[config.recordType] ?? config.recordType;
}

export function crmMatchBehaviorLabel(matchBehavior: WorkflowCrmSyncMatchBehavior): string {
  return MATCH_BEHAVIOR_LABELS[matchBehavior] ?? matchBehavior;
}

export function workflowCrmSyncConfigSummary(config: WorkflowCrmResolvedSyncConfig): string[] {
  const rows = [
    `Object: ${crmRecordTypeLabel(config)}`,
    `Match: ${crmMatchBehaviorLabel(config.matchBehavior)}`
  ];
  if (config.sourceLabel) {
    rows.push(`Source: ${config.sourceLabel}`);
  }
  return rows;
}
