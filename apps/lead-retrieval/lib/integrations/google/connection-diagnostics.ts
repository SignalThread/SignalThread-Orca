/**
 * Google Workspace binding for the shared connection diagnostics core.
 */
import {
  createConnectionDiagnosticConsoleLogger,
  emitProviderConnectionDiagnostic,
  type ProviderConnectionDiagnostic,
  type ProviderConnectionDiagnosticLogger
} from "@/lib/integrations/oauth/connection-diagnostics-core";

export type GoogleConnectionDiagnostic = ProviderConnectionDiagnostic;
export type GoogleConnectionDiagnosticLogger = ProviderConnectionDiagnosticLogger;

export const logGoogleConnectionDiagnostic: GoogleConnectionDiagnosticLogger =
  createConnectionDiagnosticConsoleLogger("[google-connection]");

export function emitGoogleConnectionDiagnostic(input: {
  level: "info" | "warn" | "error";
  diagnostic: GoogleConnectionDiagnostic;
  logger?: GoogleConnectionDiagnosticLogger;
}) {
  emitProviderConnectionDiagnostic({ ...input, logger: input.logger ?? logGoogleConnectionDiagnostic });
}
