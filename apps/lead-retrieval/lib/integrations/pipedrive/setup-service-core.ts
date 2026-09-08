import {
  type PipedriveSetupSettings,
  validatePipedriveSetupSelection
} from "@/lib/integrations/pipedrive/setup-core";
import type { PipedriveSetupOptions } from "@/lib/integrations/pipedrive/setup-options-core";

type PipedriveConnectionState = { connected: boolean };

type SetupSaveFailure = "not_connected" | "invalid_pipeline" | "invalid_stage" | "invalid_owner";

export async function getPipedriveSetupPageDataCore<TConnection extends PipedriveConnectionState>(input: {
  companyId: string;
  getConnection: (companyId: string) => Promise<TConnection>;
  getSettings: (companyId: string) => Promise<PipedriveSetupSettings>;
  getOptions: (companyId: string) => Promise<PipedriveSetupOptions>;
}) {
  const [connection, settings] = await Promise.all([
    input.getConnection(input.companyId),
    input.getSettings(input.companyId)
  ]);
  if (!connection.connected) {
    return { connection, settings, options: null, optionsError: false };
  }
  try {
    const options = await input.getOptions(input.companyId);
    return { connection, settings, options, optionsError: false };
  } catch {
    return { connection, settings, options: null, optionsError: true };
  }
}

export async function savePipedriveSetupSettingsCore(input: {
  companyId: string;
  settings: PipedriveSetupSettings;
  getConnection: (companyId: string) => Promise<PipedriveConnectionState>;
  getOptions: (companyId: string) => Promise<PipedriveSetupOptions>;
  persist: (companyId: string, settings: PipedriveSetupSettings) => Promise<void>;
}): Promise<{ ok: true } | { ok: false; error: SetupSaveFailure }> {
  const connection = await input.getConnection(input.companyId);
  if (!connection.connected) return { ok: false, error: "not_connected" };

  const options = await input.getOptions(input.companyId);
  const selectionError = validatePipedriveSetupSelection({ settings: input.settings, ...options });
  if (selectionError) return { ok: false, error: selectionError };

  await input.persist(input.companyId, input.settings);
  return { ok: true };
}
