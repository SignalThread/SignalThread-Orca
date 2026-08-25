import type { CopilotActionType } from "@/lib/copilot/types";
import type { CopilotContext } from "@/src/copilot/context/copilot-context";

export type CopilotIntentExtraction = {
  actionType: CopilotActionType | null;
  params: Record<string, unknown>;
  summary: string;
};

export interface CopilotProvider {
  parseDoIntent(prompt: string, context?: CopilotContext): Promise<CopilotIntentExtraction>;
}

function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();

  const explicit = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (explicit) {
    let hours = Number(explicit[1]);
    const minutes = Number(explicit[2]);
    const meridian = explicit[3]?.toLowerCase() ?? null;

    if (meridian === "pm" && hours < 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const hourOnly = normalized.match(/^(\d{1,2})(?:\s*(am|pm))$/i);
  if (hourOnly) {
    let hours = Number(hourOnly[1]);
    const meridian = hourOnly[2]?.toLowerCase();
    if (meridian === "pm" && hours < 12) hours += 12;
    if (meridian === "am" && hours === 12) hours = 0;
    if (hours < 0 || hours > 23) return null;
    return `${String(hours).padStart(2, "0")}:00`;
  }

  return null;
}

function extractQuotedValues(prompt: string): string[] {
  const results: string[] = [];
  const regex = /"([^"]+)"/g;
  let match: RegExpExecArray | null = regex.exec(prompt);
  while (match) {
    if (match[1]?.trim()) {
      results.push(match[1].trim());
    }
    match = regex.exec(prompt);
  }
  return results;
}

function extractCapacity(prompt: string): number | null {
  const match = prompt.match(/capacity\s*(?:of|=|to)?\s*(\d{1,6})/i) ?? prompt.match(/(\d{1,6})\s*(?:seats|people)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function extractTime(prompt: string): string | null {
  const match = prompt.match(/(?:at|from|start(?:ing)?\s+at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (!match) return null;
  return normalizeTime(match[1] ?? null);
}

function extractRoomName(prompt: string): string | null {
  const quoted = extractQuotedValues(prompt);
  const roomByKeyword = prompt.match(/(?:room|in)\s+([a-z0-9][a-z0-9\s\-]{1,60})/i);
  if (roomByKeyword?.[1]) {
    return roomByKeyword[1].trim();
  }

  if (quoted.length > 0 && /room/i.test(prompt)) {
    return quoted[quoted.length - 1] ?? null;
  }

  return null;
}

function detectSessionType(prompt: string): string {
  const text = prompt.toLowerCase();
  if (text.includes("keynote")) return "Keynote";
  if (text.includes("workshop")) return "Workshop";
  if (text.includes("panel")) return "Panel";
  if (text.includes("coffee")) return "Coffee Break";
  if (text.includes("lunch")) return "Lunch";
  if (text.includes("reception")) return "Reception";
  return "Session";
}

function extractNameAfterKeyword(prompt: string, keyword: RegExp): string | null {
  const match = prompt.match(keyword);
  if (!match?.[1]) return null;
  return match[1].trim();
}

class RuleBasedCopilotProvider implements CopilotProvider {
  async parseDoIntent(prompt: string): Promise<CopilotIntentExtraction> {
    const text = prompt.trim();
    const lower = text.toLowerCase();
    const quoted = extractQuotedValues(text);

    if ((lower.includes("add room") || lower.includes("create room")) && !lower.includes("budget")) {
      const roomName = quoted[0] ?? extractNameAfterKeyword(text, /(?:add|create)\s+room\s+(.+)$/i);
      const capacity = extractCapacity(text);
      return {
        actionType: "room.create",
        params: {
          roomName,
          capacity,
          notes: null,
        },
        summary: roomName ? `Create room "${roomName}"` : "Create a room",
      };
    }

    if (lower.includes("rename room") || lower.includes("update room")) {
      const currentName = quoted[0] ?? extractNameAfterKeyword(text, /(?:rename|update)\s+room\s+(.+?)(?:\s+to\s+|$)/i);
      const nextName = quoted[1] ?? extractNameAfterKeyword(text, /\s+to\s+(.+)$/i);
      const capacity = extractCapacity(text);
      return {
        actionType: "room.update",
        params: {
          roomName: currentName,
          newName: nextName,
          capacity,
          notes: null,
        },
        summary: currentName ? `Update room "${currentName}"` : "Update a room",
      };
    }

    if (lower.includes("move") && lower.includes("session")) {
      const sessionName = quoted[0] ?? extractNameAfterKeyword(text, /move\s+(?:session\s+)?(.+?)(?:\s+to\s+|$)/i);
      const roomName = extractRoomName(text);
      const startTime = extractTime(text);
      return {
        actionType: "session.move",
        params: {
          sessionName,
          roomName,
          startTime,
        },
        summary: sessionName ? `Move session "${sessionName}"` : "Move a session",
      };
    }

    if (lower.includes("add session") || lower.includes("create session")) {
      const sessionName = quoted[0] ?? extractNameAfterKeyword(text, /(?:add|create)\s+session\s+(.+?)(?:\s+in\s+|\s+at\s+|$)/i);
      const roomName = extractRoomName(text);
      const startTime = extractTime(text);
      const durationMatch = text.match(/(\d{1,3})\s*(?:min|minutes|m)/i);
      const durationMinutes = durationMatch ? Number(durationMatch[1]) : 60;
      return {
        actionType: "session.create",
        params: {
          sessionName,
          sessionType: detectSessionType(text),
          roomName,
          startTime,
          durationMinutes,
          expectedAttendance: extractCapacity(text),
        },
        summary: sessionName ? `Create session "${sessionName}"` : "Create a session",
      };
    }

    if (lower.includes("assign speaker")) {
      const speakerName = quoted[0] ?? extractNameAfterKeyword(text, /assign\s+speaker\s+(.+?)(?:\s+to\s+|$)/i);
      const sessionName = quoted[1] ?? extractNameAfterKeyword(text, /(?:to|for)\s+(?:session\s+)?(.+)$/i);
      return {
        actionType: "speaker.assign",
        params: {
          speakerName,
          sessionName,
        },
        summary: speakerName ? `Assign speaker "${speakerName}"` : "Assign a speaker",
      };
    }

    if (lower.includes("assign staff")) {
      const staffName = quoted[0] ?? extractNameAfterKeyword(text, /assign\s+staff\s+(.+?)(?:\s+to\s+|$)/i);
      const sessionName = quoted[1] ?? extractNameAfterKeyword(text, /(?:to|for)\s+(?:session\s+)?(.+)$/i);
      const roleMatch = text.match(/as\s+([a-z0-9\-\s]+)$/i);
      return {
        actionType: "staff.assign",
        params: {
          staffName,
          sessionName,
          staffRole: roleMatch?.[1]?.trim() ?? null,
        },
        summary: staffName ? `Assign staff "${staffName}"` : "Assign staff",
      };
    }

    if (lower.includes("room setup") || lower.includes("setup")) {
      const sessionName = quoted[0] ?? extractNameAfterKeyword(text, /(?:for|on)\s+(?:session\s+)?(.+?)(?:\s+to\s+|$)/i);
      const setupType = quoted[1] ?? extractNameAfterKeyword(text, /(?:to|as)\s+([a-z0-9\-\s]+)$/i);
      return {
        actionType: "roomSetup.set",
        params: {
          sessionName,
          roomSetupType: setupType,
        },
        summary: sessionName ? `Set room setup for "${sessionName}"` : "Set room setup",
      };
    }

    if (lower.includes("food") || lower.includes("f&b") || lower.includes("beverage")) {
      const sessionName = quoted[0] ?? extractNameAfterKeyword(text, /(?:for|on)\s+(?:session\s+)?(.+?)(?:\s+to\s+|$)/i);
      const serviceType = quoted[1] ?? extractNameAfterKeyword(text, /(?:to|as)\s+([a-z0-9\-\s]+)$/i);
      const headcount = extractCapacity(text);
      return {
        actionType: "foodService.set",
        params: {
          sessionName,
          serviceType,
          serviceStyle: null,
          headcount,
        },
        summary: sessionName ? `Set food service for "${sessionName}"` : "Set food service",
      };
    }

    if (lower.includes("budget") && (lower.includes("add") || lower.includes("create")) && lower.includes("line")) {
      const lineItem = quoted[0] ?? extractNameAfterKeyword(text, /(?:line\s*item|budget\s*item)\s+(.+)$/i);
      const amountMatch = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/i);
      const forecastCents = amountMatch ? Math.round(Number(amountMatch[1]) * 100) : 0;
      return {
        actionType: "budgetLineItem.create",
        params: {
          lineItem,
          category: "Operations",
          subcategory: "General",
          forecastCents,
          actualCents: 0,
        },
        summary: lineItem ? `Create budget line item "${lineItem}"` : "Create budget line item",
      };
    }

    if (lower.includes("budget") && (lower.includes("update") || lower.includes("change")) && lower.includes("line")) {
      const lineItem = quoted[0] ?? extractNameAfterKeyword(text, /(?:line\s*item|budget\s*item)\s+(.+?)(?:\s+to\s+|$)/i);
      const amountMatch = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/i);
      const forecastCents = amountMatch ? Math.round(Number(amountMatch[1]) * 100) : null;
      return {
        actionType: "budgetLineItem.update",
        params: {
          lineItem,
          forecastCents,
        },
        summary: lineItem ? `Update budget line item "${lineItem}"` : "Update budget line item",
      };
    }

    if (lower.includes("add note") || lower.includes("note")) {
      const sessionName = quoted[0] ?? extractNameAfterKeyword(text, /(?:for|on)\s+(?:session\s+)?(.+?)(?:\s*:\s*|$)/i);
      const noteText = quoted[1] ?? extractNameAfterKeyword(text, /note\s*(?:for\s+.+?:|:)\s*(.+)$/i) ?? text;
      return {
        actionType: "note.add",
        params: {
          sessionName,
          noteText,
        },
        summary: sessionName ? `Add note to "${sessionName}"` : "Add a session note",
      };
    }

    if (lower.includes("update session") || lower.includes("edit session")) {
      const sessionName = quoted[0] ?? extractNameAfterKeyword(text, /(?:update|edit)\s+session\s+(.+?)(?:\s+to\s+|$)/i);
      const newTitle = quoted[1] ?? null;
      const startTime = extractTime(text);
      const roomName = extractRoomName(text);
      return {
        actionType: "session.update",
        params: {
          sessionName,
          newTitle,
          startTime,
          roomName,
        },
        summary: sessionName ? `Update session "${sessionName}"` : "Update a session",
      };
    }

    return {
      actionType: null,
      params: {},
      summary: "I couldn't map that request to a supported Do action.",
    };
  }
}

export function getCopilotProvider(): CopilotProvider {
  return new RuleBasedCopilotProvider();
}
