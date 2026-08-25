/* eslint-disable @typescript-eslint/no-explicit-any */
export type CopilotResolutionResult =
  | {
      kind: "proposal";
      proposal: {
        actionType: string;
        title: string;
        summary?: string;
        params: Record<string, any>;
      };
      telemetry?: any;
    }
  | {
      kind: "clarification";
      question: string;
      missing?: string[];
      suggestions?: string[];
      telemetry?: any;
    }
  | {
      kind: "answer";
      message: string;
      telemetry?: any;
    };

export function normalizeCopilotResult(input: CopilotResolutionResult): CopilotResolutionResult {
  if (input.kind === "proposal") {
    return {
      kind: "proposal",
      proposal: {
        actionType: input.proposal.actionType,
        title: input.proposal.title,
        ...(typeof input.proposal.summary === "string" && input.proposal.summary.trim()
          ? { summary: input.proposal.summary.trim() }
          : {}),
        params: input.proposal.params ?? {},
      },
      ...(typeof input.telemetry === "undefined" ? {} : { telemetry: input.telemetry }),
    };
  }

  if (input.kind === "clarification") {
    return {
      kind: "clarification",
      question: input.question,
      ...(Array.isArray(input.missing) && input.missing.length > 0 ? { missing: input.missing } : {}),
      ...(Array.isArray(input.suggestions) && input.suggestions.length > 0 ? { suggestions: input.suggestions } : {}),
      ...(typeof input.telemetry === "undefined" ? {} : { telemetry: input.telemetry }),
    };
  }

  return {
    kind: "answer",
    message: input.message,
    ...(typeof input.telemetry === "undefined" ? {} : { telemetry: input.telemetry }),
  };
}
