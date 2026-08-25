import { SESSION_READINESS_METADATA, type SessionReadinessStatus } from "@/lib/session-readiness";
import {
  SESSION_REQUIREMENT_PLATFORM_DEFAULT_CATALOGS,
  inferSessionRequirementCatalogType,
} from "@/lib/session-requirement-catalog";

export type SessionStatusOption = {
  key: string;
  value: string;
  label: string;
};

type SessionStatusTemplate = {
  sections: Array<{
    key: string;
    label: string;
    sortOrder: number;
    items: Array<{
      key: string;
      label: string;
      active: boolean;
      sortOrder: number;
    }>;
  }>;
};

const platformStatusCatalog = SESSION_REQUIREMENT_PLATFORM_DEFAULT_CATALOGS.find(
  (section) => section.type === "STATUS",
);

export const SESSION_STATUS_PLATFORM_DEFAULT_OPTIONS: SessionStatusOption[] =
  platformStatusCatalog?.items.map((item) => ({
    key: item.key,
    value: item.label,
    label: item.label,
  })) ?? [];

export function sessionStatusOptionsFromTemplate(
  template: SessionStatusTemplate | null | undefined,
): SessionStatusOption[] {
  if (!template) return SESSION_STATUS_PLATFORM_DEFAULT_OPTIONS;

  const statusSection = [...template.sections]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .find((section) => inferSessionRequirementCatalogType(section) === "STATUS");

  if (!statusSection) return SESSION_STATUS_PLATFORM_DEFAULT_OPTIONS;

  return [...statusSection.items]
    .filter((item) => item.active)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({ key: item.key, value: item.label, label: item.label }));
}

export function canonicalSessionStatusValue(
  value: unknown,
  options: SessionStatusOption[],
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return options.find((option) => option.value.trim().toLowerCase() === normalized)?.value ?? null;
}

export function sessionStatusReadinessStatus(status: string): SessionReadinessStatus {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return "not_started";
  if (/\b(blocked|conflict|risk|cancelled|canceled)\b/.test(normalized)) return "blocked";
  if (/\b(needs?|missing|pending|draft|in progress|attention)\b/.test(normalized)) return "needs_info";
  if (/\b(confirmed|ready|complete|done)\b/.test(normalized)) return "ready";
  return "not_started";
}

export function sessionStatusBadgeClassName(status: string): string {
  return SESSION_READINESS_METADATA[sessionStatusReadinessStatus(status)].badgeClassName;
}
