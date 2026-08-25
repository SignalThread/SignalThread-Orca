import { getPrisma } from "@/lib/prisma";
import {
  getMatrix2Snapshot,
  type Matrix2PersonRecord,
  type Matrix2RoomRecord,
  type Matrix2SessionRecord,
} from "@/lib/matrix2";
import type { CopilotContext } from "@/src/copilot/context/copilot-context";

type AskIntent =
  | "event.summary"
  | "room.list"
  | "session.list"
  | "session.conflicts"
  | "room.capacity"
  | "budget.summary"
  | "docs.summary"
  | "timeline.summary"
  | "staffing.gaps"
  | "product.help";

export type AskAnswer = {
  message: string;
};

function detectAskIntent(prompt: string): AskIntent {
  const text = prompt.toLowerCase();

  if (text.includes("what can you do") || text.includes("help") || text.includes("how do i")) {
    return "product.help";
  }
  if (text.includes("staff") && (text.includes("gap") || text.includes("missing") || text.includes("coverage"))) {
    return "staffing.gaps";
  }
  if (text.includes("timeline")) {
    return "timeline.summary";
  }
  if (text.includes("doc") || text.includes("document")) {
    return "docs.summary";
  }
  if (text.includes("budget") || text.includes("variance") || text.includes("forecast") || text.includes("actual")) {
    return "budget.summary";
  }
  if (text.includes("capacity")) {
    return "room.capacity";
  }
  if (text.includes("conflict") || text.includes("double-book") || text.includes("overlap")) {
    return "session.conflicts";
  }
  if (text.includes("session") && (text.includes("list") || text.includes("show") || text.includes("what sessions"))) {
    return "session.list";
  }
  if (text.includes("room") && (text.includes("list") || text.includes("show") || text.includes("what rooms"))) {
    return "room.list";
  }

  return "event.summary";
}

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function sessionsOverlap(a: Matrix2SessionRecord, b: Matrix2SessionRecord): boolean {
  if (a.date !== b.date) return false;
  const aStart = toMinutes(a.startTime);
  const aEnd = toMinutes(a.endTime);
  const bStart = toMinutes(b.startTime);
  const bEnd = toMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

function detectConflicts(sessions: Matrix2SessionRecord[]) {
  const conflicts: Array<{ type: "SPEAKER_DOUBLE_BOOKED" | "ROOM_OVERLAP" | "CAPACITY_EXCEEDED"; sessionIds: string[]; detail: string }> = [];

  for (let i = 0; i < sessions.length; i += 1) {
    const current = sessions[i];

    if (
      current.expectedAttendance !== null &&
      current.roomCapacity !== null &&
      current.expectedAttendance > current.roomCapacity
    ) {
      conflicts.push({
        type: "CAPACITY_EXCEEDED",
        sessionIds: [current.id],
        detail: `${current.title}: expected ${current.expectedAttendance} > room capacity ${current.roomCapacity}`,
      });
    }

    for (let j = i + 1; j < sessions.length; j += 1) {
      const next = sessions[j];
      if (!sessionsOverlap(current, next)) continue;

      const sameRoom =
        Boolean(current.roomId && next.roomId && current.roomId === next.roomId) ||
        (!current.roomId && !next.roomId && current.roomName.trim().toLowerCase() === next.roomName.trim().toLowerCase());

      if (sameRoom) {
        conflicts.push({
          type: "ROOM_OVERLAP",
          sessionIds: [current.id, next.id],
          detail: `${current.roomName}: ${current.title} overlaps ${next.title}`,
        });
      }

      const speakerSet = new Set(current.speakers.map((speaker) => speaker.trim().toLowerCase()).filter(Boolean));
      const duplicates = next.speakers
        .map((speaker) => speaker.trim())
        .filter((speaker) => speakerSet.has(speaker.toLowerCase()));

      if (duplicates.length > 0) {
        conflicts.push({
          type: "SPEAKER_DOUBLE_BOOKED",
          sessionIds: [current.id, next.id],
          detail: `${duplicates.join(", ")} double-booked between ${current.title} and ${next.title}`,
        });
      }
    }
  }

  return conflicts;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function ensureEventContext(eventId: string | undefined): string | null {
  if (eventId && eventId.trim()) return eventId.trim();
  return null;
}

export async function answerAskPrompt(input: {
  orgId: string;
  eventId?: string;
  prompt: string;
  context?: CopilotContext;
}): Promise<AskAnswer> {
  const intent = detectAskIntent(input.prompt);
  const eventId = ensureEventContext(input.context?.eventId ?? input.eventId);

  if (!eventId) {
    if (intent === "product.help") {
      return {
        message: "Planner Copilot supports Ask (read-only event/product questions) and Do (propose-and-approve actions). Open an event to ask event-specific questions or run Do actions.",
      };
    }

    const eventCount = await getPrisma().event.count({ where: { orgId: input.orgId } });
    return {
      message: `You're currently outside an event. I can answer global questions, and I found ${eventCount} events in this org. Open an event to ask about sessions, rooms, conflicts, budget, docs, or timeline details.`,
    };
  }

  const event = await getPrisma().event.findFirst({
    where: { id: eventId, orgId: input.orgId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
    },
  });

  if (!event) {
    return {
      message: "I couldn't access that event in your current organization context.",
    };
  }

  if (intent === "product.help") {
    return {
      message: "In Ask mode I can summarize this event's sessions, rooms, conflicts, budget, docs, timeline, and staffing gaps. In Do mode I will always propose a typed action card first, then wait for approval before execution.",
    };
  }

  if (intent === "budget.summary") {
    const budget = await getPrisma().budget.findUnique({
      where: { eventId: event.id },
      select: {
        lineItems: {
          select: {
            forecastCents: true,
            actualCents: true,
          },
        },
      },
    });

    if (!budget) {
      return {
        message: `No budget is configured for ${event.name} yet.`,
      };
    }

    const forecastCents = budget.lineItems.reduce((sum, item) => sum + item.forecastCents, 0);
    const actualCents = budget.lineItems.reduce((sum, item) => sum + item.actualCents, 0);
    const varianceCents = actualCents - forecastCents;

    return {
      message: `Budget summary for ${event.name}: Forecast ${formatMoney(forecastCents)}, Actual ${formatMoney(actualCents)}, Variance ${formatMoney(varianceCents)} (${varianceCents >= 0 ? "over" : "under"} forecast).`,
    };
  }

  if (intent === "docs.summary") {
    const docs = await getPrisma().document.findMany({
      where: { eventId: event.id },
      select: { status: true },
    });

    const byStatus = new Map<string, number>();
    for (const doc of docs) {
      byStatus.set(doc.status, (byStatus.get(doc.status) ?? 0) + 1);
    }

    const statusSummary = Array.from(byStatus.entries())
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");

    return {
      message: `Documents for ${event.name}: ${docs.length} total${statusSummary ? ` (${statusSummary})` : ""}.`,
    };
  }

  if (intent === "timeline.summary") {
    const timelineItems = await getPrisma().timelineItem.findMany({
      where: { eventId: event.id, disposition: "ACTIVE" },
      select: {
        status: true,
      },
    });

    const byStatus = new Map<string, number>();
    for (const item of timelineItems) {
      byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
    }

    const statusSummary = Array.from(byStatus.entries())
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");

    return {
      message: `Timeline summary for ${event.name}: ${timelineItems.length} items${statusSummary ? ` (${statusSummary})` : ""}.`,
    };
  }

  const contextRooms = Array.isArray(input.context?.pageData?.rooms)
    ? (input.context.pageData.rooms as Matrix2RoomRecord[])
    : null;
  const contextSessions = Array.isArray(input.context?.pageData?.sessions)
    ? (input.context.pageData.sessions as Matrix2SessionRecord[])
    : null;
  const contextPeople = Array.isArray(input.context?.pageData?.people)
    ? (input.context.pageData.people as Matrix2PersonRecord[])
    : null;

  const snapshot: { rooms: Matrix2RoomRecord[]; sessions: Matrix2SessionRecord[]; people: Matrix2PersonRecord[] } =
    contextRooms && contextSessions
      ? {
          rooms: contextRooms,
          sessions: contextSessions,
          people: contextPeople ?? [],
        }
      : await getMatrix2Snapshot(event.id);

  if (intent === "room.list") {
    const roomList = snapshot.rooms.map((room) => `${room.name}${room.capacity ? ` (${room.capacity})` : ""}`);
    return {
      message: roomList.length > 0
        ? `Rooms (${roomList.length}): ${roomList.join(", ")}.`
        : "No rooms are configured yet.",
    };
  }

  if (intent === "session.list") {
    const preview = snapshot.sessions
      .slice(0, 12)
      .map((session) => `${session.title} (${session.date} ${session.startTime}-${session.endTime}, ${session.roomName})`)
      .join("; ");

    return {
      message: snapshot.sessions.length > 0
        ? `Sessions (${snapshot.sessions.length}): ${preview}${snapshot.sessions.length > 12 ? "; ..." : ""}`
        : "No sessions are scheduled yet.",
    };
  }

  if (intent === "room.capacity") {
    const overCapacity = snapshot.sessions.filter(
      (session) =>
        session.expectedAttendance !== null &&
        session.roomCapacity !== null &&
        session.expectedAttendance > session.roomCapacity,
    );

    if (overCapacity.length === 0) {
      return {
        message: "No room capacity issues detected.",
      };
    }

    const details = overCapacity
      .slice(0, 8)
      .map((session) => `${session.title} (${session.roomName}: ${session.expectedAttendance}/${session.roomCapacity})`)
      .join("; ");

    return {
      message: `Capacity issues (${overCapacity.length}): ${details}${overCapacity.length > 8 ? "; ..." : ""}`,
    };
  }

  if (intent === "session.conflicts") {
    const conflicts = detectConflicts(snapshot.sessions);
    if (conflicts.length === 0) {
      return {
        message: "No conflicts detected across rooms, speakers, or capacity.",
      };
    }

    const preview = conflicts
      .slice(0, 8)
      .map((conflict) => `[${conflict.type}] ${conflict.detail}`)
      .join("; ");

    return {
      message: `Conflicts detected (${conflicts.length}): ${preview}${conflicts.length > 8 ? "; ..." : ""}`,
    };
  }

  if (intent === "staffing.gaps") {
    const staffingGaps = snapshot.sessions.filter((session) => session.staffAssigned.length === 0);
    if (staffingGaps.length === 0) {
      return { message: "No obvious staffing gaps found. Every session has staff assigned." };
    }

    const preview = staffingGaps
      .slice(0, 8)
      .map((session) => `${session.title} (${session.date} ${session.startTime}, ${session.roomName})`)
      .join("; ");

    return {
      message: `Staffing gaps (${staffingGaps.length} sessions with no assigned staff): ${preview}${staffingGaps.length > 8 ? "; ..." : ""}`,
    };
  }

  const conflicts = detectConflicts(snapshot.sessions);
  return {
    message: `Event summary for ${event.name}: ${snapshot.rooms.length} rooms, ${snapshot.sessions.length} sessions, ${conflicts.length} conflicts, and ${snapshot.people.length} event people in Matrix 2 data.`,
  };
}
