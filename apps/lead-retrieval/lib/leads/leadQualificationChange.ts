import { parseLeadTemperature } from "@/lib/leads/temperature";

type LeadQualificationSnapshot = {
  rating?: number | null;
  temperature?: string | null;
  status?: string | null;
};

function hasOwn(object: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function leadQualificationChanged(
  patch: Record<string, unknown>,
  before: LeadQualificationSnapshot,
  after: LeadQualificationSnapshot
) {
  if (hasOwn(patch, "rating")) {
    if (Number(before.rating ?? 0) !== Number(after.rating ?? 0)) return true;
  }
  if (hasOwn(patch, "temperature")) {
    const previousTemperature = parseLeadTemperature(before.temperature) ?? null;
    const nextTemperature = parseLeadTemperature(after.temperature) ?? null;
    if (previousTemperature !== nextTemperature) return true;
  }
  if (hasOwn(patch, "status")) {
    if (String(before.status ?? "") !== String(after.status ?? "")) return true;
  }
  return false;
}
