/**
 * Deterministic banquet audience topology inference from Apply prompts.
 */

import type {
  LayoutSpecAudienceArcStrength,
  LayoutSpecAudienceDepthBias,
  LayoutSpecAudienceTopologyIntent,
  LayoutSpecAudienceWidthBias,
} from "./layout-spec";

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseRowCount(raw: string): number | null {
  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric) && numeric > 0) return clampInt(numeric, 1, 12);
  const word = raw.trim().toLowerCase();
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };
  return words[word] ?? null;
}

function extractPreferredRowsFromPrompt(
  prompt: string,
  currentTopologyRows?: number | null,
): number | undefined {
  const text = prompt.trim();
  if (!text) return undefined;

  const insteadMatch = text.match(
    /\b(?:make\s+(?:this|it)\s+)?(?:(\d+|one|two|three|four|five|six|seven|eight)\s+rows?)\s+instead\s+of\s+(\d+|one|two|three|four|five|six|seven|eight)\s+rows?\b/i,
  );
  if (insteadMatch) {
    const preferred = parseRowCount(insteadMatch[1]!);
    if (preferred) return preferred;
  }

  const makeItRows = text.match(
    /\b(?:make\s+(?:this|it)\s+)?(?:(\d+|one|two|three|four|five|six|seven|eight)\s+rows?)\b/i,
  );
  if (makeItRows) {
    const preferred = parseRowCount(makeItRows[1]!);
    if (preferred) return preferred;
  }

  const plainRows = text.match(/\b(\d+)\s+rows?\s+of\s+tables?\b/i);
  if (plainRows) {
    const preferred = parseRowCount(plainRows[1]!);
    if (preferred) return preferred;
  }

  if (/\b(?:more|extra|additional)\s+rows?\b/i.test(text) && currentTopologyRows != null) {
    return clampInt(currentTopologyRows + 1, 1, 12);
  }
  if (/\b(?:fewer|less)\s+rows?\b/i.test(text) && currentTopologyRows != null) {
    return clampInt(currentTopologyRows - 1, 1, 12);
  }

  return undefined;
}

function extractWidthBiasFromPrompt(prompt: string): LayoutSpecAudienceWidthBias | undefined {
  const text = prompt.trim();
  if (!text) return undefined;
  if (
    /\b(?:spread\s+(?:the\s+)?(?:tables?|seating)\s+(?:out\s+)?(?:more|wider)?|make\s+(?:this|it)\s+wider|wider(?:\s+(?:layout|pack|spread|banquet|table\s+spacing))?|expand(?:\s+(?:the\s+)?(?:pack|spread|width))?)\b/i.test(
      text,
    )
  ) {
    return "wider";
  }
  if (/\b(?:narrower|tighter(?:\s+(?:pack|layout|spread|banquet|table\s+spacing))?|compress(?:\s+(?:the\s+)?(?:pack|width))?)\b/i.test(text)) {
    return "narrower";
  }
  return undefined;
}

function extractDepthBiasFromPrompt(prompt: string): LayoutSpecAudienceDepthBias | undefined {
  const text = prompt.trim();
  if (!text) return undefined;
  if (
    /\b(?:deeper|make\s+(?:this|it)\s+deeper|more\s+depth|push(?:\s+(?:it|tables))?\s+back|extend(?:\s+(?:the\s+)?depth)?)\b/i.test(
      text,
    )
  ) {
    return "deeper";
  }
  if (
    /\b(?:shallower|make\s+(?:this|it)\s+shallower|less\s+depth|pull(?:\s+(?:it|tables))?\s+forward|shorten(?:\s+(?:the\s+)?depth)?)\b/i.test(
      text,
    )
  ) {
    return "shallower";
  }
  return undefined;
}

function extractArcStrengthFromPrompt(prompt: string): LayoutSpecAudienceArcStrength | undefined {
  const text = prompt.trim();
  if (!text) return undefined;
  if (
    /\b(?:stronger\s+arc|more\s+curved|more\s+crescent|more\s+dramatic(?:\s+crescent)?|deeper\s+crescent|dramatic\s+arc|stronger\s+crescent|more\s+pronounced(?:\s+arc)?)\b/i.test(
      text,
    )
  ) {
    return "stronger";
  }
  if (
    /\b(?:softer\s+arc|less\s+curved|less\s+crescent|subtle(?:r)?\s+(?:arc|crescent)|gentler\s+crescent|less\s+dramatic)\b/i.test(
      text,
    )
  ) {
    return "softer";
  }
  if (/\b(?:normal\s+arc|standard\s+crescent)\b/i.test(text)) {
    return "normal";
  }
  return undefined;
}

export function inferAudienceTopologyFromPrompt(
  prompt: string,
  currentTopologyRows?: number | null,
): LayoutSpecAudienceTopologyIntent {
  const preferredRows = extractPreferredRowsFromPrompt(prompt, currentTopologyRows);
  const widthBias = extractWidthBiasFromPrompt(prompt);
  const depthBias = extractDepthBiasFromPrompt(prompt);
  const arcStrength = extractArcStrengthFromPrompt(prompt);

  return {
    ...(preferredRows !== undefined ? { preferredRows } : {}),
    ...(widthBias ? { widthBias } : {}),
    ...(depthBias ? { depthBias } : {}),
    ...(arcStrength ? { arcStrength } : {}),
  };
}

export function mergeAudienceTopologyIntent(
  base: LayoutSpecAudienceTopologyIntent | undefined,
  next: LayoutSpecAudienceTopologyIntent | undefined,
): LayoutSpecAudienceTopologyIntent | undefined {
  if (!base && !next) return undefined;
  const merged: LayoutSpecAudienceTopologyIntent = {
    ...(base ?? {}),
    ...(next ?? {}),
  };
  if (
    merged.preferredRows === undefined &&
    merged.widthBias === undefined &&
    merged.depthBias === undefined &&
    merged.arcStrength === undefined
  ) {
    return undefined;
  }
  return merged;
}

export function audienceTopologyIntentChanged(
  base: LayoutSpecAudienceTopologyIntent | undefined,
  next: LayoutSpecAudienceTopologyIntent | undefined,
): boolean {
  if (!base && !next) return false;
  if (!base || !next) return true;
  return (
    base.preferredRows !== next.preferredRows ||
    base.widthBias !== next.widthBias ||
    base.depthBias !== next.depthBias ||
    base.arcStrength !== next.arcStrength
  );
}

export function normalizeAudienceTopologyFromUnknown(
  value: unknown,
): LayoutSpecAudienceTopologyIntent | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const out: {
    preferredRows?: number;
    widthBias?: LayoutSpecAudienceWidthBias;
    depthBias?: LayoutSpecAudienceDepthBias;
    arcStrength?: LayoutSpecAudienceArcStrength;
  } = {};

  if (row.preferredRows !== undefined && row.preferredRows !== null) {
    const preferredRows = clampInt(Number(row.preferredRows) || 0, 1, 12);
    if (preferredRows > 0) out.preferredRows = preferredRows;
  }

  const widthBias = row.widthBias;
  if (widthBias === "narrower" || widthBias === "wider") {
    out.widthBias = widthBias;
  }

  const depthBias = row.depthBias;
  if (depthBias === "shallower" || depthBias === "deeper") {
    out.depthBias = depthBias;
  }

  const arcStrength = row.arcStrength;
  if (arcStrength === "softer" || arcStrength === "normal" || arcStrength === "stronger") {
    out.arcStrength = arcStrength;
  }

  if (
    out.preferredRows === undefined &&
    out.widthBias === undefined &&
    out.depthBias === undefined &&
    out.arcStrength === undefined
  ) {
    return null;
  }

  return out;
}
