export type PipedriveDestinationType = "lead" | "deal";
export type PipedriveOwnerMode = "connected_user" | "selected_user";

export type PipedriveSetupSettings = {
  destinationType: PipedriveDestinationType;
  createPerson: boolean;
  createOrganization: boolean;
  pipelineId: string | null;
  stageId: string | null;
  ownerMode: PipedriveOwnerMode;
  ownerUserId: string | null;
  createFollowUpActivity: boolean;
  matchPersonByEmail: boolean;
  matchOrganizationByNameOrDomain: boolean;
  sendConversationSynopsis: boolean;
  sendGeneratedEmailDraft: boolean;
};

export type PipedriveSetupOption = { id: string; name: string };
export type PipedriveStageOption = PipedriveSetupOption & { pipelineId: string };

export const DEFAULT_PIPEDRIVE_SETUP_SETTINGS: PipedriveSetupSettings = {
  destinationType: "lead",
  createPerson: true,
  createOrganization: true,
  pipelineId: null,
  stageId: null,
  ownerMode: "connected_user",
  ownerUserId: null,
  createFollowUpActivity: true,
  matchPersonByEmail: true,
  matchOrganizationByNameOrDomain: true,
  sendConversationSynopsis: true,
  sendGeneratedEmailDraft: true
};

function stringOrNull(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function asBoolean(value: unknown) {
  return value === true || value === "on" || value === "true" || value === "1";
}

export function parsePipedriveSetupSettings(input: Record<string, unknown>):
  | { ok: true; value: PipedriveSetupSettings }
  | { ok: false; error: "invalid_destination" | "missing_deal_destination" | "missing_owner" } {
  const destinationType = String(input.destinationType ?? "lead").trim();
  if (destinationType !== "lead" && destinationType !== "deal") {
    return { ok: false, error: "invalid_destination" };
  }
  const ownerMode = String(input.ownerMode ?? "connected_user").trim();
  const pipelineId = destinationType === "deal" ? stringOrNull(input.pipelineId) : null;
  const stageId = destinationType === "deal" ? stringOrNull(input.stageId) : null;
  if (destinationType === "deal" && (!pipelineId || !stageId)) {
    return { ok: false, error: "missing_deal_destination" };
  }
  const ownerUserId = ownerMode === "selected_user" ? stringOrNull(input.ownerUserId) : null;
  if (ownerMode !== "connected_user" && ownerMode !== "selected_user") {
    return { ok: false, error: "missing_owner" };
  }
  if (ownerMode === "selected_user" && !ownerUserId) {
    return { ok: false, error: "missing_owner" };
  }

  return {
    ok: true,
    value: {
      destinationType,
      createPerson: asBoolean(input.createPerson),
      createOrganization: asBoolean(input.createOrganization),
      pipelineId,
      stageId,
      ownerMode,
      ownerUserId,
      createFollowUpActivity: asBoolean(input.createFollowUpActivity),
      matchPersonByEmail: asBoolean(input.matchPersonByEmail),
      matchOrganizationByNameOrDomain: asBoolean(input.matchOrganizationByNameOrDomain),
      sendConversationSynopsis: asBoolean(input.sendConversationSynopsis),
      sendGeneratedEmailDraft: asBoolean(input.sendGeneratedEmailDraft)
    }
  };
}

export function validatePipedriveSetupSelection(input: {
  settings: PipedriveSetupSettings;
  pipelines: readonly PipedriveSetupOption[];
  stages: readonly PipedriveStageOption[];
  users: readonly PipedriveSetupOption[];
}): "invalid_pipeline" | "invalid_stage" | "invalid_owner" | null {
  const { settings } = input;
  if (settings.destinationType === "deal") {
    if (!input.pipelines.some((pipeline) => pipeline.id === settings.pipelineId)) return "invalid_pipeline";
    if (!input.stages.some((stage) => stage.id === settings.stageId && stage.pipelineId === settings.pipelineId)) {
      return "invalid_stage";
    }
  }
  if (
    settings.ownerMode === "selected_user" &&
    !input.users.some((user) => user.id === settings.ownerUserId)
  ) {
    return "invalid_owner";
  }
  return null;
}

export function toPipedriveSetupPersistenceRow(companyId: string, settings: PipedriveSetupSettings) {
  return {
    company_id: companyId,
    provider: "pipedrive",
    destination_type: settings.destinationType,
    create_person: settings.createPerson,
    create_organization: settings.createOrganization,
    pipeline_id: settings.pipelineId,
    stage_id: settings.stageId,
    owner_mode: settings.ownerMode,
    owner_user_id: settings.ownerUserId,
    create_follow_up_activity: settings.createFollowUpActivity,
    match_person_by_email: settings.matchPersonByEmail,
    match_organization_by_name_or_domain: settings.matchOrganizationByNameOrDomain,
    send_conversation_synopsis: settings.sendConversationSynopsis,
    send_generated_email_draft: settings.sendGeneratedEmailDraft
  };
}
