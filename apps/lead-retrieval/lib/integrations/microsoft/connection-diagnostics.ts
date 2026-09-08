/**
 * Microsoft 365 binding for the shared connection diagnostics core.
 */
import {
  createConnectionDiagnosticConsoleLogger,
  emitProviderConnectionDiagnostic,
  type ProviderConnectionDiagnostic,
  type ProviderConnectionDiagnosticLogger
} from "@/lib/integrations/oauth/connection-diagnostics-core";

export type Microsoft365ConnectionDiagnostic = ProviderConnectionDiagnostic;
export type Microsoft365ConnectionDiagnosticLogger = ProviderConnectionDiagnosticLogger;

export const logMicrosoft365ConnectionDiagnostic: Microsoft365ConnectionDiagnosticLogger =
  createConnectionDiagnosticConsoleLogger("[microsoft-connection]");

export function emitMicrosoft365ConnectionDiagnostic(input: {
  level: "info" | "warn" | "error";
  diagnostic: Microsoft365ConnectionDiagnostic;
  logger?: Microsoft365ConnectionDiagnosticLogger;
}) {
  emitProviderConnectionDiagnostic({
    ...input,
    logger: input.logger ?? logMicrosoft365ConnectionDiagnostic
  });
}
