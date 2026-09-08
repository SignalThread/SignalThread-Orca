import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_PIPEDRIVE_SETUP_SETTINGS,
  type PipedriveSetupSettings,
  toPipedriveSetupPersistenceRow
} from "@/lib/integrations/pipedrive/setup-core";
import { getPipedriveConnectionStatus } from "@/lib/integrations/pipedrive/connection-service";
import { listPipedriveSetupOptions } from "@/lib/integrations/pipedrive/setup-options";
import {
  getPipedriveSetupPageDataCore,
  savePipedriveSetupSettingsCore
} from "@/lib/integrations/pipedrive/setup-service-core";

type PipedriveSettingsRow = {
  destination_type: string;
  create_person: boolean;
  create_organization: boolean;
  pipeline_id: string | null;
  stage_id: string | null;
  owner_mode: string;
  owner_user_id: string | null;
  create_follow_up_activity: boolean;
  match_person_by_email: boolean;
  match_organization_by_name_or_domain: boolean;
  send_conversation_synopsis: boolean;
  send_generated_email_draft: boolean;
};

function toSettings(row: PipedriveSettingsRow | null): PipedriveSetupSettings {
  if (!row) return DEFAULT_PIPEDRIVE_SETUP_SETTINGS;
  return {
    destinationType: row.destination_type === "deal" ? "deal" : "lead",
    createPerson: Boolean(row.create_person),
    createOrganization: Boolean(row.create_organization),
    pipelineId: row.pipeline_id ?? null,
    stageId: row.stage_id ?? null,
    ownerMode: row.owner_mode === "selected_user" ? "selected_user" : "connected_user",
    ownerUserId: row.owner_user_id ?? null,
    createFollowUpActivity: Boolean(row.create_follow_up_activity),
    matchPersonByEmail: Boolean(row.match_person_by_email),
    matchOrganizationByNameOrDomain: Boolean(row.match_organization_by_name_or_domain),
    sendConversationSynopsis: Boolean(row.send_conversation_synopsis),
    sendGeneratedEmailDraft: Boolean(row.send_generated_email_draft)
  };
}

export async function getPipedriveSetupSettings(companyId: string) {
  const response = await (createAdminClient() as any)
    .from("pipedrive_integration_settings")
    .select(
      "destination_type, create_person, create_organization, pipeline_id, stage_id, owner_mode, owner_user_id, create_follow_up_activity, match_person_by_email, match_organization_by_name_or_domain, send_conversation_synopsis, send_generated_email_draft"
    )
    .eq("company_id", companyId)
    .maybeSingle();
  if (response.error) throw new Error("Unable to load Pipedrive setup.");
  return toSettings((response.data as PipedriveSettingsRow | null) ?? null);
}

export async function getPipedriveSetupPageData(companyId: string) {
  return getPipedriveSetupPageDataCore({
    companyId,
    getConnection: getPipedriveConnectionStatus,
    getSettings: getPipedriveSetupSettings,
    getOptions: listPipedriveSetupOptions
  });
}

export async function savePipedriveSetupSettings(input: {
  companyId: string;
  settings: PipedriveSetupSettings;
}) {
  return savePipedriveSetupSettingsCore({
    ...input,
    getConnection: getPipedriveConnectionStatus,
    getOptions: listPipedriveSetupOptions,
    persist: async (companyId, settings) => {
      const response = await (createAdminClient() as any)
        .from("pipedrive_integration_settings")
        .upsert(
          toPipedriveSetupPersistenceRow(companyId, settings),
          { onConflict: "company_id" }
        );
      if (response.error) throw new Error("Unable to save Pipedrive setup.");
    }
  });
}
