export type ProfileCompleteness = "Incomplete" | "Partial" | "Complete";

type CompletenessInput = {
  name: string | null | undefined;
  email: string | null | undefined;
  bio: string | null | undefined;
  title: string | null | undefined;
  company: string | null | undefined;
};

export function completenessClasses(value: ProfileCompleteness): string {
  if (value === "Complete") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "Partial") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export function completenessDotClasses(value: ProfileCompleteness): string {
  if (value === "Complete") return "bg-emerald-500";
  if (value === "Partial") return "bg-blue-500";
  return "bg-slate-400";
}

export function computeCompleteness(input: CompletenessInput): ProfileCompleteness {
  const hasName = Boolean(input.name?.trim());
  const hasEmail = Boolean(input.email?.trim());
  const hasBio = Boolean(input.bio?.trim());
  const hasTitle = Boolean(input.title?.trim());
  const hasCompany = Boolean(input.company?.trim());

  if (!hasName || !hasEmail) return "Incomplete";
  if (hasBio && hasTitle && hasCompany) return "Complete";
  return "Partial";
}

export function computeCompletenessDetails(input: CompletenessInput): {
  completeness: ProfileCompleteness;
  missingItems: string[];
} {
  const missingItems: string[] = [];

  if (!input.name?.trim()) {
    missingItems.push("Missing Name");
  }
  if (!input.email?.trim()) {
    missingItems.push("Missing Email");
  }
  if (!input.title?.trim() || !input.company?.trim()) {
    missingItems.push("Missing Title/Company");
  }
  if (!input.bio?.trim()) {
    missingItems.push("Missing Bio");
  }

  return {
    completeness: computeCompleteness(input),
    missingItems,
  };
}
