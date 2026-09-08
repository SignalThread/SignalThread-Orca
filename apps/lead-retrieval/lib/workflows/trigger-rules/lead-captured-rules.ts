export type LeadCapturedRuleLead = {
  rating?: number | null;
  temperature?: string | null;
  status?: string | null;
  source?: string | null;
};

export type LeadCapturedRuleMatch =
  | {
      ok: true;
      ruleId: string | null;
      triggerFingerprint: string;
      reasonMatched: "default_no_lead_rules" | "lead_rule_matched";
    }
  | {
      ok: false;
      ruleId: string | null;
      triggerFingerprint: string | null;
      reasonSkipped: "lead_rule_mismatch" | "invalid_trigger_conditions";
    };

export function evaluateLeadCapturedTriggerRules(input: {
  conditions: unknown;
  lead: LeadCapturedRuleLead;
}): LeadCapturedRuleMatch {
  const parsed = parseLeadCapturedRule(input.conditions);
  if (parsed.kind === "default") {
    return {
      ok: true,
      ruleId: null,
      triggerFingerprint: "default",
      reasonMatched: "default_no_lead_rules"
    };
  }
  if (parsed.kind === "invalid") {
    return {
      ok: false,
      ruleId: null,
      triggerFingerprint: null,
      reasonSkipped: "invalid_trigger_conditions"
    };
  }

  const rule = parsed.rule;
  if (!matchesRating(rule.rating, input.lead.rating)) {
    return skipped(rule.ruleId);
  }
  if (!matchesStringRule(rule.temperature, input.lead.temperature)) {
    return skipped(rule.ruleId);
  }
  if (!matchesStringRule(rule.status, input.lead.status)) {
    return skipped(rule.ruleId);
  }
  if (!matchesStringRule(rule.source, input.lead.source)) {
    return skipped(rule.ruleId);
  }

  return {
    ok: true,
    ruleId: rule.ruleId,
    triggerFingerprint: `rule:${rule.ruleId}`,
    reasonMatched: "lead_rule_matched"
  };
}

type ParsedLeadRule =
  | { kind: "default" }
  | { kind: "invalid" }
  | { kind: "rule"; rule: NormalizedLeadCapturedRule };

type NormalizedLeadCapturedRule = {
  ruleId: string;
  rating: NumericRule | null;
  temperature: StringRule | null;
  status: StringRule | null;
  source: StringRule | null;
};

type NumericRule = {
  in?: number[];
  gte?: number;
  lte?: number;
  eq?: number;
};

type StringRule = {
  in: string[];
};

function parseLeadCapturedRule(conditions: unknown): ParsedLeadRule {
  if (conditions === null || conditions === undefined) return { kind: "default" };
  if (typeof conditions !== "object" || Array.isArray(conditions)) return { kind: "invalid" };

  const root = conditions as Record<string, unknown>;
  if (Object.keys(root).length === 0) return { kind: "default" };

  const rawRule = asRecord(root.lead_captured) ?? root;
  const ruleId = cleanString(rawRule.ruleId) ?? cleanString(rawRule.rule_id);
  if (!ruleId) return { kind: "invalid" };

  const rating = parseNumericRule(rawRule.rating);
  const temperature = parseStringRule(rawRule.temperature);
  const status = parseStringRule(rawRule.status);
  const source = parseStringRule(rawRule.source);
  if (
    rating === "invalid" ||
    temperature === "invalid" ||
    status === "invalid" ||
    source === "invalid"
  ) {
    return { kind: "invalid" };
  }

  if (!rating && !temperature && !status && !source) return { kind: "invalid" };

  return {
    kind: "rule",
    rule: {
      ruleId,
      rating,
      temperature,
      status,
      source
    }
  };
}

function parseNumericRule(value: unknown): NumericRule | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return { eq: value };
  if (Array.isArray(value)) {
    const nums = value.map(Number).filter(Number.isFinite);
    return nums.length === value.length && nums.length > 0 ? { in: nums } : "invalid";
  }
  const obj = asRecord(value);
  if (!obj) return "invalid";
  const rule: NumericRule = {};
  if ("in" in obj) {
    if (!Array.isArray(obj.in)) return "invalid";
    const nums = obj.in.map(Number).filter(Number.isFinite);
    if (nums.length !== obj.in.length || nums.length === 0) return "invalid";
    rule.in = nums;
  }
  if ("gte" in obj) {
    const n = Number(obj.gte);
    if (!Number.isFinite(n)) return "invalid";
    rule.gte = n;
  }
  if ("lte" in obj) {
    const n = Number(obj.lte);
    if (!Number.isFinite(n)) return "invalid";
    rule.lte = n;
  }
  if ("eq" in obj) {
    const n = Number(obj.eq);
    if (!Number.isFinite(n)) return "invalid";
    rule.eq = n;
  }
  return Object.keys(rule).length > 0 ? rule : "invalid";
}

function parseStringRule(value: unknown): StringRule | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const text = normalizeString(value);
    return text ? { in: [text] } : "invalid";
  }
  if (Array.isArray(value)) {
    const values = value.map(normalizeString).filter(Boolean);
    return values.length === value.length && values.length > 0 ? { in: values } : "invalid";
  }
  const obj = asRecord(value);
  if (!obj || !Array.isArray(obj.in)) return "invalid";
  const values = obj.in.map(normalizeString).filter(Boolean);
  return values.length === obj.in.length && values.length > 0 ? { in: values } : "invalid";
}

function matchesRating(rule: NumericRule | null, value: number | null | undefined) {
  if (!rule) return true;
  if (!Number.isFinite(value)) return false;
  const n = Number(value);
  if (n <= 0) return false;
  if (rule.eq !== undefined && n !== rule.eq) return false;
  if (rule.in && !rule.in.includes(n)) return false;
  if (rule.gte !== undefined && n < rule.gte) return false;
  if (rule.lte !== undefined && n > rule.lte) return false;
  return true;
}

function matchesStringRule(rule: StringRule | null, value: string | null | undefined) {
  if (!rule) return true;
  const text = normalizeString(value);
  return Boolean(text && rule.in.includes(text));
}

function skipped(ruleId: string): LeadCapturedRuleMatch {
  return {
    ok: false,
    ruleId,
    triggerFingerprint: `rule:${ruleId}`,
    reasonSkipped: "lead_rule_mismatch"
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
