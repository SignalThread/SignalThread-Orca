const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function envFlagEnabled(name: string): boolean {
  return ENABLED_VALUES.has((process.env[name] ?? "").trim().toLowerCase());
}

export function isPlaywrightE2E(): boolean {
  return envFlagEnabled("PW_E2E");
}

export function isE2EVerboseLoggingEnabled(): boolean {
  return envFlagEnabled("PW_E2E_VERBOSE_LOGS");
}

export function shouldQuietE2ERoutineLogs(): boolean {
  return isPlaywrightE2E() && !isE2EVerboseLoggingEnabled();
}

export function shouldLogBudgetDebug(): boolean {
  return envFlagEnabled("BUDGET_DEBUG_LOGS") || isE2EVerboseLoggingEnabled();
}

export function shouldLogNotificationDebug(): boolean {
  return envFlagEnabled("NOTIFICATION_DEBUG_LOGS") || isE2EVerboseLoggingEnabled();
}
