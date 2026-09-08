export type ConversationInsightPayload = {
  summary: string;
  sentiment: string;
  problem_severity: string;
  buying_intent: string;
  objections: string[];
  next_steps: string[];
  competitors_mentioned: string[];
  pain_points: string[];
  feature_requests: string[];
  buying_signals: string[];
  operational_pains: string[];
  workflow_constraints: string[];
  technical_constraints: string[];
  desired_outcomes: string[];
  adoption_risks: string[];
  management_visibility_needs: string[];
  business_process_concerns: string[];
  product_objections: string[];
  rep_behavior_patterns: string[];
  priority_themes: string[];
};

export const CONVERSATION_INSIGHT_SCHEMA_NAME = "sales_conversation_intelligence";

const ARRAY_OF_STRINGS = { type: "array", items: { type: "string" } } as const;

export const CONVERSATION_INSIGHT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "sentiment",
    "problem_severity",
    "buying_intent",
    "objections",
    "next_steps",
    "competitors_mentioned",
    "pain_points",
    "feature_requests",
    "buying_signals",
    "operational_pains",
    "workflow_constraints",
    "technical_constraints",
    "desired_outcomes",
    "adoption_risks",
    "management_visibility_needs",
    "business_process_concerns",
    "product_objections",
    "rep_behavior_patterns",
    "priority_themes"
  ],
  properties: {
    summary: { type: "string" },
    sentiment: { type: "string" },
    problem_severity: { type: "string" },
    buying_intent: { type: "string" },
    objections: ARRAY_OF_STRINGS,
    next_steps: ARRAY_OF_STRINGS,
    competitors_mentioned: ARRAY_OF_STRINGS,
    pain_points: ARRAY_OF_STRINGS,
    feature_requests: ARRAY_OF_STRINGS,
    buying_signals: ARRAY_OF_STRINGS,
    operational_pains: ARRAY_OF_STRINGS,
    workflow_constraints: ARRAY_OF_STRINGS,
    technical_constraints: ARRAY_OF_STRINGS,
    desired_outcomes: ARRAY_OF_STRINGS,
    adoption_risks: ARRAY_OF_STRINGS,
    management_visibility_needs: ARRAY_OF_STRINGS,
    business_process_concerns: ARRAY_OF_STRINGS,
    product_objections: ARRAY_OF_STRINGS,
    rep_behavior_patterns: ARRAY_OF_STRINGS,
    priority_themes: ARRAY_OF_STRINGS
  }
} as const;

const EMPTY_ARRAY_FIELDS = [
  "objections",
  "next_steps",
  "competitors_mentioned",
  "pain_points",
  "feature_requests",
  "buying_signals",
  "operational_pains",
  "workflow_constraints",
  "technical_constraints",
  "desired_outcomes",
  "adoption_risks",
  "management_visibility_needs",
  "business_process_concerns",
  "product_objections",
  "rep_behavior_patterns",
  "priority_themes"
] as const satisfies readonly (keyof ConversationInsightPayload)[];

type ConversationInsightArrayField = (typeof EMPTY_ARRAY_FIELDS)[number];

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function uniq(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function withCategory(prefix: string, values: string[]) {
  return values.map((value) => {
    const trimmed = value.trim();
    return trimmed.toLowerCase().startsWith(`${prefix.toLowerCase()}:`)
      ? trimmed
      : `${prefix}: ${trimmed}`;
  });
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text.length > 0) return text;
  }
  return "";
}

export function normalizeConversationInsightPayload(
  input: Partial<ConversationInsightPayload>
): ConversationInsightPayload {
  const normalized: ConversationInsightPayload = {
    summary: firstNonEmpty(input.summary),
    sentiment: firstNonEmpty(input.sentiment),
    problem_severity: firstNonEmpty(input.problem_severity, "unknown"),
    buying_intent: firstNonEmpty(input.buying_intent, "unknown"),
    objections: [],
    next_steps: [],
    competitors_mentioned: [],
    pain_points: [],
    feature_requests: [],
    buying_signals: [],
    operational_pains: [],
    workflow_constraints: [],
    technical_constraints: [],
    desired_outcomes: [],
    adoption_risks: [],
    management_visibility_needs: [],
    business_process_concerns: [],
    product_objections: [],
    rep_behavior_patterns: [],
    priority_themes: []
  };

  const normalizedArrays = normalized as Record<ConversationInsightArrayField, string[]>;
  for (const field of EMPTY_ARRAY_FIELDS) {
    normalizedArrays[field] = toStringArray(input[field]);
  }

  normalized.pain_points = uniq([
    ...normalized.pain_points,
    ...normalized.operational_pains,
    ...normalized.workflow_constraints,
    ...normalized.technical_constraints,
    ...normalized.business_process_concerns
  ]);

  normalized.objections = uniq([
    ...normalized.objections,
    ...withCategory("Product objection", normalized.product_objections),
    ...withCategory("Business/process concern", normalized.business_process_concerns),
    ...withCategory("Adoption risk", normalized.adoption_risks),
    ...withCategory("Technical/environmental constraint", normalized.technical_constraints)
  ]);

  return normalized;
}

export function parseConversationInsightJson(raw: string): ConversationInsightPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Conversation insight response was not valid JSON.");
  }

  const insight = normalizeConversationInsightPayload(parsed as Partial<ConversationInsightPayload>);
  if (!insight.summary || !insight.sentiment) {
    throw new Error("Conversation insight JSON missing required summary or sentiment.");
  }
  return insight;
}

export function buildConversationInsightPrompt(input: {
  contextTitle?: string;
  context?: string | null;
  transcriptTitle: string;
  transcript: string;
}) {
  const context = String(input.context ?? "").trim();
  const contextLines = context
    ? [input.contextTitle ?? "Context:", context, ""]
    : [];

  return [
    "Analyze the sales conversation as enterprise sales intelligence for RevOps, AEs, sales engineers, and managers.",
    "This is not a generic meeting summary and not marketing copy.",
    "Use the transcript as the primary evidence. Preserve operationally meaningful human phrasing or paraphrase it closely.",
    "Prefer concrete field language over abstract SaaS wording.",
    "Avoid phrases such as \"modern AI-driven platform\", \"actionable insights\", \"streamlined workflows\", \"positive sentiment\" without evidence, and \"No objections captured\" when concerns or risks are present.",
    "",
    "Separate these dimensions:",
    "- sentiment: the speaker's tone toward the conversation or solution only",
    "- problem_severity: how painful or urgent the operational problem appears",
    "- buying_intent: evidence of budget, timeline, authority, evaluation, or willingness to advance",
    "",
    "Extract weighted categories explicitly, including operational pains, workflow constraints, technical/environmental constraints, desired outcomes, buying signals, adoption risks, and management visibility needs. Do not flatten everything into one recap paragraph.",
    "For priority_themes, rank what mattered most by conversational emphasis and specificity.",
    "For objections, differentiate product objections from business/process concerns, adoption risks, and technical/environmental constraints. Include concerns in objections with clear category labels when they would matter to an AE or SE.",
    "For next_steps, write concrete sales or sales-engineering actions, not generic follow-up language.",
    "Good next steps include validating workflow speed on mobile, demonstrating offline reliability, showing AI-generated conversation summaries, walking through manager visibility dashboards, and demonstrating post-event follow-up automation when supported by the transcript.",
    "",
    "Return STRICT JSON only with exactly these fields:",
    "- summary: string, 3-5 sentences, concrete and evidence-led",
    "- sentiment: string",
    "- problem_severity: string",
    "- buying_intent: string",
    "- objections: string[]",
    "- next_steps: string[]",
    "- competitors_mentioned: string[]",
    "- pain_points: string[]",
    "- feature_requests: string[]",
    "- buying_signals: string[]",
    "- operational_pains: string[]",
    "- workflow_constraints: string[]",
    "- technical_constraints: string[]",
    "- desired_outcomes: string[]",
    "- adoption_risks: string[]",
    "- management_visibility_needs: string[]",
    "- business_process_concerns: string[]",
    "- product_objections: string[]",
    "- rep_behavior_patterns: string[]",
    "- priority_themes: string[]",
    "",
    ...contextLines,
    input.transcriptTitle,
    input.transcript
  ].join("\n");
}
