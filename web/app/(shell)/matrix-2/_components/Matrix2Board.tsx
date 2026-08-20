"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AlertTriangle, Archive, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { isSessionModuleAvailable } from "@/config/features";
import { getPlanningTone } from "@/lib/design/tones";
import {
  matrix2SessionCardTypeClasses,
  matrix2SessionTypeBadgeClasses,
} from "@/lib/matrix2-session-visuals";
import { isMatrix2SessionCardNestedInteractiveControl } from "@/lib/matrix2-session-drag";
import {
  deriveMatrix2BoardRoomGroups,
  normalizeMatrix2VirtualRoomKey,
  type Matrix2BoardRoomGroup,
} from "@/lib/matrix2-board-rooms";
import {
  computeMatrix2BoardCardProjection,
  computeMatrix2SessionBlockLayout,
  computeMatrix2TimeByRoomScale,
  computeMatrix2TimelineRangeLayout,
  computeMatrix2TimelineScale,
  type Matrix2BoardOrientation,
} from "@/lib/matrix2-board-layout";
import { buildTimeWindow, conflictSummary, formatTimeLabel, toMinutes } from "./conflict-utils";
import {
  MATRIX2_QUICK_MODULES,
  type Matrix2QuickModuleLauncherVariant,
} from "./matrix2-quick-modules";
import { deriveMatrix2SessionReadiness, type Matrix2ReadinessTone } from "./matrix2-session-readiness";
import { MatrixConflictTooltipList, uniqueConflictMessages } from "./MatrixConflictBadgeWithTooltip";
import {
  MATRIX2_ZOOM_CONFIG,
  Matrix2Conflict,
  Matrix2Room,
  Matrix2SessionAction,
  Matrix2Session,
  Matrix2SessionDropTarget,
  Matrix2TemplateDropTarget,
  Matrix2ZoomMode,
} from "./types";

type Matrix2BoardProps = {
  rooms: Matrix2Room[];
  sessions: Matrix2Session[];
  selectedSessionId: string | null;
  conflictsBySession: Map<string, Matrix2Conflict[]>;
  orientation: Matrix2BoardOrientation;
  zoomMode: Matrix2ZoomMode;
  isDraggingTemplate: boolean;
  isDraggingSession: boolean;
  activeDragSessionId: string | null;
  onConsumeSessionDragClick: () => boolean;
  isAddingRoom: boolean;
  isTaskDrawerOpen?: boolean;
  onSessionAction: (sessionId: string, action: Matrix2SessionAction) => void;
  onDeleteSession: (sessionId: string) => void;
  onClearSelection: () => void;
  onOpenAddRoom: () => void;
  onOpenEditRoom: (room: Matrix2Room) => void;
};

type SessionPlacement = {
  session: Matrix2Session;
  left: number;
  width: number;
  top: number;
  height?: number;
  trackIndex: number;
};

const ROOM_LABEL_WIDTH_MAX = 228;
const ROOM_LABEL_WIDTH_MIN = 136;
const TIME_LABEL_WIDTH = 112;
const ROOM_COLUMN_MIN_WIDTH = 156;
const ROOM_COLUMN_PADDING = 8;
const BOARD_HEADER_HEIGHT = 48;
const ACTION_LAUNCHER_WIDTH = 340;
const ACTION_LAUNCHER_ESTIMATED_HEIGHT = 326;
const ACTION_LAUNCHER_GAP = 8;
const ACTION_LAUNCHER_VIEWPORT_PADDING = 12;
const ACTION_LAUNCHER_CLOSE_DELAY_MS = 240;
const ACTION_LAUNCHER_HOVER_BRIDGE_PX = ACTION_LAUNCHER_GAP + 18;
const TRACK_GAP = 6;
const LANE_TOP_PADDING = 6;
const LANE_BOTTOM_PADDING = 6;
const DROP_SLOT_MINUTES = 30;
const SESSION_CARD_MEDIUM_WIDTH = 140;
const FLIPPED_SESSION_CARD_WIDTH = 136;
const TIME_BY_ROOM_SESSION_CARD_MEDIUM_HEIGHT = 64;
const TIME_BY_ROOM_SESSION_CARD_TINY_HEIGHT = 44;
const TIME_BY_ROOM_SESSION_CARD_START_TIME_HEIGHT = 36;
type ReadinessTone = Matrix2ReadinessTone;

// Stable empty-conflicts reference so memoized session cards/launchers do not see a
// brand-new array on every board render when a session has no conflicts.
const EMPTY_CONFLICTS: Matrix2Conflict[] = [];

export function typeColorClasses(sessionType: string): string {
  return matrix2SessionTypeBadgeClasses(sessionType);
}

export function sessionCardTypeClasses(sessionType: string): string {
  return matrix2SessionCardTypeClasses(sessionType);
}

function layoutRoomSessions(input: {
  sessions: Matrix2Session[];
  startMinutes: number;
  endMinutes: number;
  minuteWidth: number;
  cardHeight: number;
}): { placements: SessionPlacement[]; laneHeight: number } {
  const sorted = [...input.sessions].sort((left, right) => {
    const leftStart = toMinutes(left.startTime) ?? 0;
    const rightStart = toMinutes(right.startTime) ?? 0;
    if (leftStart !== rightStart) return leftStart - rightStart;

    const leftEnd = toMinutes(left.endTime) ?? 0;
    const rightEnd = toMinutes(right.endTime) ?? 0;
    if (leftEnd !== rightEnd) return leftEnd - rightEnd;

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });

  const trackEndMinutes: number[] = [];
  const placements: SessionPlacement[] = [];

  for (const session of sorted) {
    const placement = computeMatrix2SessionBlockLayout({
      startTime: session.startTime,
      endTime: session.endTime,
      windowStartMinutes: input.startMinutes,
      windowEndMinutes: input.endMinutes,
      minuteWidth: input.minuteWidth,
    });

    let trackIndex = trackEndMinutes.findIndex((trackEnd) => trackEnd <= placement.clampedStartMinutes);
    if (trackIndex === -1) {
      trackIndex = trackEndMinutes.length;
      trackEndMinutes.push(placement.clampedEndMinutes);
    } else {
      trackEndMinutes[trackIndex] = placement.clampedEndMinutes;
    }

    const top = LANE_TOP_PADDING + trackIndex * (input.cardHeight + TRACK_GAP);

    placements.push({
      session,
      left: placement.left,
      width: placement.width,
      top,
      trackIndex,
    });
  }

  const trackCount = Math.max(1, trackEndMinutes.length);
  const laneHeight = Math.max(
    trackCount * input.cardHeight + Math.max(0, trackCount - 1) * TRACK_GAP + LANE_TOP_PADDING + LANE_BOTTOM_PADDING,
    input.cardHeight + LANE_TOP_PADDING + LANE_BOTTOM_PADDING,
  );

  return {
    placements,
    laneHeight,
  };
}

function layoutTimeRoomSessions(input: {
  sessions: Matrix2Session[];
  startMinutes: number;
  endMinutes: number;
  minuteHeight: number;
  cardWidth: number;
}): { placements: SessionPlacement[]; columnWidth: number } {
  const sorted = [...input.sessions].sort((left, right) => {
    const leftStart = toMinutes(left.startTime) ?? 0;
    const rightStart = toMinutes(right.startTime) ?? 0;
    if (leftStart !== rightStart) return leftStart - rightStart;

    const leftEnd = toMinutes(left.endTime) ?? 0;
    const rightEnd = toMinutes(right.endTime) ?? 0;
    if (leftEnd !== rightEnd) return leftEnd - rightEnd;

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });

  const trackEndMinutes: number[] = [];
  const placements: SessionPlacement[] = [];

  for (const session of sorted) {
    const placement = computeMatrix2SessionBlockLayout({
      startTime: session.startTime,
      endTime: session.endTime,
      windowStartMinutes: input.startMinutes,
      windowEndMinutes: input.endMinutes,
      minuteWidth: input.minuteHeight,
    });

    let trackIndex = trackEndMinutes.findIndex((trackEnd) => trackEnd <= placement.clampedStartMinutes);
    if (trackIndex === -1) {
      trackIndex = trackEndMinutes.length;
      trackEndMinutes.push(placement.clampedEndMinutes);
    } else {
      trackEndMinutes[trackIndex] = placement.clampedEndMinutes;
    }

    const projected = computeMatrix2BoardCardProjection({
      orientation: "TIME_BY_ROOM",
      timeOffset: placement.left,
      timeSize: placement.width,
      roomOffset: ROOM_COLUMN_PADDING + trackIndex * (input.cardWidth + TRACK_GAP),
      roomSize: input.cardWidth,
    });

    placements.push({
      session,
      left: projected.left,
      width: projected.width,
      top: projected.top,
      height: projected.height,
      trackIndex,
    });
  }

  const trackCount = Math.max(1, trackEndMinutes.length);
  const columnWidth = Math.max(
    ROOM_COLUMN_MIN_WIDTH,
    ROOM_COLUMN_PADDING * 2 + trackCount * input.cardWidth + Math.max(0, trackCount - 1) * TRACK_GAP,
  );

  return {
    placements,
    columnWidth,
  };
}

function Matrix2Board({
  rooms,
  sessions,
  selectedSessionId,
  conflictsBySession,
  orientation,
  zoomMode,
  isDraggingTemplate,
  isDraggingSession,
  activeDragSessionId,
  onConsumeSessionDragClick,
  isAddingRoom,
  isTaskDrawerOpen = false,
  onSessionAction,
  onDeleteSession,
  onClearSelection,
  onOpenAddRoom,
  onOpenEditRoom,
}: Matrix2BoardProps) {
  const zoom = MATRIX2_ZOOM_CONFIG[zoomMode];
  const isDraggingAny = isDraggingTemplate || isDraggingSession;
  const boardFrameRef = useRef<HTMLDivElement | null>(null);
  const actionLauncherRef = useRef<HTMLDivElement | null>(null);
  const closeActionLauncherTimerRef = useRef<number | null>(null);
  const [boardFrameWidth, setBoardFrameWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [actionSessionId, setActionSessionId] = useState<string | null>(null);
  const [actionLauncherPinned, setActionLauncherPinned] = useState(false);
  // Mirror the pinned flag into a ref so the hover/toggle handlers can stay
  // useCallback-stable (no `actionLauncherPinned` dep) and still read the latest value.
  const actionLauncherPinnedRef = useRef(actionLauncherPinned);
  actionLauncherPinnedRef.current = actionLauncherPinned;
  const isDraggingSessionRef = useRef(isDraggingSession);
  isDraggingSessionRef.current = isDraggingSession;
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(() => new Set());
  const updateBoardFrameWidth = (node: HTMLDivElement | null = boardFrameRef.current) => {
    if (!node) return;
    const width = Math.round(node.clientWidth * 1000) / 1000;
    setBoardFrameWidth((previous) => (Math.abs(previous - width) < 0.5 ? previous : width));
  };
  const roomLabelBasis = viewportWidth > 0 ? viewportWidth : boardFrameWidth;
  const roomLabelWidth =
    roomLabelBasis > 0
      ? Math.round(Math.min(ROOM_LABEL_WIDTH_MAX, Math.max(ROOM_LABEL_WIDTH_MIN, roomLabelBasis * 0.18)))
      : ROOM_LABEL_WIDTH_MAX;
  const axisLabelWidth = orientation === "TIME_BY_ROOM" ? TIME_LABEL_WIDTH : roomLabelWidth;

  const sessionsWithValidTimes = useMemo(() => {
    return sessions.filter((session) => {
      const startMinutes = toMinutes(session.startTime);
      const endMinutes = toMinutes(session.endTime);
      return startMinutes !== null && endMinutes !== null && endMinutes > startMinutes;
    });
  }, [sessions]);

  const timeWindow = useMemo(() => buildTimeWindow(sessionsWithValidTimes), [sessionsWithValidTimes]);

  const boardRooms = useMemo(() => deriveMatrix2BoardRoomGroups(rooms, sessions), [rooms, sessions]);

  const { sessionsByRoom, skippedSessionWarnings } = useMemo(() => {
    const grouped = new Map<string, Matrix2Session[]>();
    const roomGroupsById = new Map<string, Matrix2BoardRoomGroup>();
    const virtualRoomGroupsByKey = new Map<string, Matrix2BoardRoomGroup>();
    const warnings: string[] = [];

    for (const room of boardRooms) {
      grouped.set(room.id, []);
      roomGroupsById.set(room.id, room);
      if (room.isVirtual && room.virtualRoomKey) {
        virtualRoomGroupsByKey.set(room.virtualRoomKey, room);
      }
    }

    for (const session of sessions) {
      if ((session as Matrix2Session & { isTemporary?: boolean }).isTemporary === true) {
        warnings.push(`Skipping ${session.id}: temporary sessions are not rendered in board lanes`);
        continue;
      }

      const sessionRoomId = session.roomId?.trim() ?? "";
      let roomGroup = sessionRoomId ? roomGroupsById.get(sessionRoomId) : undefined;
      roomGroup ??= virtualRoomGroupsByKey.get(normalizeMatrix2VirtualRoomKey(session.roomName));
      if (!roomGroup) {
        warnings.push(`Skipping ${session.id}: missing board room group for "${session.roomName || "Unassigned"}"`);
        continue;
      }

      const startMinutes = toMinutes(session.startTime);
      const endMinutes = toMinutes(session.endTime);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        warnings.push(`Rendering ${session.id} with fallback layout: invalid time range "${session.startTime}"-"${session.endTime}"`);
      }

      if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes && (
        endMinutes <= timeWindow.startMinutes || startMinutes >= timeWindow.endMinutes
      )) {
        warnings.push(
          `Skipping ${session.id}: outside visible window ${session.startTime}-${session.endTime} (${timeWindow.startMinutes}-${timeWindow.endMinutes})`,
        );
        continue;
      }

      const roomSessions = grouped.get(roomGroup.id);
      if (roomSessions) {
        roomSessions.push(session);
      }
    }

    return {
      sessionsByRoom: grouped,
      skippedSessionWarnings: warnings,
    };
  }, [boardRooms, sessions, timeWindow.endMinutes, timeWindow.startMinutes]);

  const timelineScale = computeMatrix2TimelineScale({
    containerWidth: boardFrameWidth,
    roomColumnWidth: axisLabelWidth,
    windowStartMinutes: timeWindow.startMinutes,
    windowEndMinutes: timeWindow.endMinutes,
  });
  const timeByRoomScale = computeMatrix2TimeByRoomScale();
  const timelineWidth = timelineScale.availableTimelineWidth;
  const minuteWidthEff = timelineScale.minuteWidth;
  const labelEveryHours = timelineScale.labelEveryHours;
  const timeByRoomMinuteHeight = timeByRoomScale.minuteHeight;
  const timeByRoomLabelEveryHours = timeByRoomScale.labelEveryHours;

  useLayoutEffect(() => {
    const el = boardFrameRef.current;
    if (!el) return;
    const update = () => updateBoardFrameWidth(el);
    update();
    const animationFrame = window.requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const update = () => {
      setViewportWidth((previous) => (Math.abs(previous - window.innerWidth) < 0.5 ? previous : window.innerWidth));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { laneModels, placementWarnings } = useMemo(() => {
    const warnings: string[] = [];
    const models = boardRooms.map((room) => {
      const roomSessions = sessionsByRoom.get(room.id) ?? [];
      const lane = layoutRoomSessions({
        sessions: roomSessions,
        startMinutes: timeWindow.startMinutes,
        endMinutes: timeWindow.endMinutes,
        minuteWidth: minuteWidthEff,
        cardHeight: zoom.cardHeight,
      });

      const validPlacements = lane.placements.filter(({ session, left, width, top }) => {
        const hasValidBounds =
          Number.isFinite(left) &&
          Number.isFinite(top) &&
          Number.isFinite(width) &&
          left >= 0 &&
          top >= 0 &&
          width > 0 &&
          left < timelineWidth &&
          left + width <= timelineWidth + 0.5 &&
          top + zoom.cardHeight <= lane.laneHeight + 0.5;

        if (!hasValidBounds) {
          warnings.push(
            `Skipping ${session.id}: out-of-bounds placement (left=${left}, width=${width}, top=${top}, laneHeight=${lane.laneHeight}, timelineWidth=${timelineWidth})`,
          );
        }

        return hasValidBounds;
      });
      const trackCount = validPlacements.reduce((max, placement) => Math.max(max, placement.trackIndex + 1), 1);
      const isExpanded = expandedRoomIds.has(room.id);
      const hasStackedSessions = trackCount > 1;
      const placements = isExpanded || !hasStackedSessions ? validPlacements : validPlacements.filter((placement) => placement.trackIndex === 0);
      const hiddenSessionCount = validPlacements.length - placements.length;
      const compactLaneHeight = zoom.cardHeight + LANE_TOP_PADDING + LANE_BOTTOM_PADDING;
      const laneHeight = isExpanded || !hasStackedSessions ? lane.laneHeight : compactLaneHeight;

      return {
        room,
        roomSessions,
        laneHeight,
        placements,
        hiddenSessionCount,
        isExpanded,
        isExpandable: hasStackedSessions && hiddenSessionCount > 0,
      };
    });

    return {
      laneModels: models,
      placementWarnings: warnings,
    };
  }, [boardRooms, expandedRoomIds, minuteWidthEff, sessionsByRoom, timeWindow.endMinutes, timeWindow.startMinutes, timelineWidth, zoom.cardHeight]);

  const { flippedRoomModels, flippedPlacementWarnings, flippedTimelineHeight, flippedBoardWidth } = useMemo(() => {
    const warnings: string[] = [];
    let cursorLeft = 0;
    const timelineHeight = Math.max(1, (timeWindow.endMinutes - timeWindow.startMinutes) * timeByRoomMinuteHeight);
    const models = boardRooms.map((room) => {
      const roomSessions = sessionsByRoom.get(room.id) ?? [];
      const layout = layoutTimeRoomSessions({
        sessions: roomSessions,
        startMinutes: timeWindow.startMinutes,
        endMinutes: timeWindow.endMinutes,
        minuteHeight: timeByRoomMinuteHeight,
        cardWidth: FLIPPED_SESSION_CARD_WIDTH,
      });

      const validPlacements = layout.placements.filter(({ session, left, width, top, height }) => {
        const placementHeight = height ?? 0;
        const hasValidBounds =
          Number.isFinite(left) &&
          Number.isFinite(top) &&
          Number.isFinite(width) &&
          Number.isFinite(placementHeight) &&
          left >= 0 &&
          top >= 0 &&
          width > 0 &&
          placementHeight > 0 &&
          left + width <= layout.columnWidth + 0.5 &&
          top < timelineHeight &&
          top + placementHeight <= timelineHeight + 0.5;

        if (!hasValidBounds) {
          warnings.push(
            `Skipping ${session.id}: out-of-bounds flipped placement (left=${left}, width=${width}, top=${top}, height=${placementHeight}, columnWidth=${layout.columnWidth}, timelineHeight=${timelineHeight})`,
          );
        }

        return hasValidBounds;
      });

      const model = {
        room,
        roomSessions,
        left: cursorLeft,
        width: layout.columnWidth,
        placements: validPlacements,
      };
      cursorLeft += layout.columnWidth;
      return model;
    });

    return {
      flippedRoomModels: models,
      flippedPlacementWarnings: warnings,
      flippedTimelineHeight: timelineHeight,
      flippedBoardWidth: cursorLeft,
    };
  }, [boardRooms, sessionsByRoom, timeByRoomMinuteHeight, timeWindow.endMinutes, timeWindow.startMinutes]);

  const activeLauncher = useMemo(() => {
    if (isDraggingSession) return null;
    const activeSessionId = actionSessionId;
    if (!activeSessionId) return null;

    const boardViewport = boardFrameRef.current;
    const visibleLeft = boardViewport?.scrollLeft ?? 0;
    const visibleTop = boardViewport?.scrollTop ?? 0;
    const visibleWidth = boardViewport?.clientWidth ?? boardFrameWidth;
    const visibleHeight = boardViewport?.clientHeight ?? 0;
    const visibleRight = visibleLeft + Math.max(visibleWidth, ACTION_LAUNCHER_WIDTH + ACTION_LAUNCHER_VIEWPORT_PADDING * 2);
    const visibleBottom = visibleTop + Math.max(visibleHeight, ACTION_LAUNCHER_ESTIMATED_HEIGHT + ACTION_LAUNCHER_VIEWPORT_PADDING * 2);

    if (orientation === "TIME_BY_ROOM") {
      for (const roomModel of flippedRoomModels) {
        const placement = roomModel.placements.find(({ session }) => session.id === activeSessionId);
        if (placement) {
          const cardLeft = TIME_LABEL_WIDTH + roomModel.left + placement.left;
          const cardTop = BOARD_HEADER_HEIGHT + placement.top;
          const cardHeight = placement.height ?? zoom.cardHeight;
          const rightSideLeft = cardLeft + placement.width + ACTION_LAUNCHER_GAP;
          const leftSideLeft = cardLeft - ACTION_LAUNCHER_WIDTH - ACTION_LAUNCHER_GAP;
          const left =
            rightSideLeft + ACTION_LAUNCHER_WIDTH <= visibleRight - ACTION_LAUNCHER_VIEWPORT_PADDING
              ? rightSideLeft
              : leftSideLeft >= visibleLeft + ACTION_LAUNCHER_VIEWPORT_PADDING
                ? leftSideLeft
                : Math.min(
                    Math.max(visibleLeft + ACTION_LAUNCHER_VIEWPORT_PADDING, rightSideLeft),
                    Math.max(visibleLeft + ACTION_LAUNCHER_VIEWPORT_PADDING, visibleRight - ACTION_LAUNCHER_WIDTH - ACTION_LAUNCHER_VIEWPORT_PADDING),
                  );
          const side: "left" | "right" = left < cardLeft ? "left" : "right";
          const desiredTop = cardTop + Math.max(ACTION_LAUNCHER_GAP, Math.min(cardHeight - 4, 20));
          const minTop = visibleTop + ACTION_LAUNCHER_VIEWPORT_PADDING;
          const maxTop = Math.max(minTop, visibleBottom - ACTION_LAUNCHER_ESTIMATED_HEIGHT - ACTION_LAUNCHER_VIEWPORT_PADDING);
          return {
            session: placement.session,
            conflicts: conflictsBySession.get(placement.session.id) ?? EMPTY_CONFLICTS,
            left,
            top: Math.min(Math.max(minTop, desiredTop), maxTop),
            side,
          };
        }
      }

      return null;
    }

    let laneTop = BOARD_HEADER_HEIGHT;
    for (const lane of laneModels) {
      const placement = lane.placements.find(({ session }) => session.id === activeSessionId);
      if (placement) {
        const rightSideLeft = roomLabelWidth + placement.left + placement.width + ACTION_LAUNCHER_GAP;
        const leftSideLeft = roomLabelWidth + placement.left - ACTION_LAUNCHER_WIDTH - ACTION_LAUNCHER_GAP;
        const left =
          rightSideLeft + ACTION_LAUNCHER_WIDTH <= visibleRight - ACTION_LAUNCHER_VIEWPORT_PADDING
            ? rightSideLeft
            : leftSideLeft >= visibleLeft + ACTION_LAUNCHER_VIEWPORT_PADDING
              ? leftSideLeft
              : Math.min(
                  Math.max(visibleLeft + ACTION_LAUNCHER_VIEWPORT_PADDING, rightSideLeft),
                  Math.max(visibleLeft + ACTION_LAUNCHER_VIEWPORT_PADDING, visibleRight - ACTION_LAUNCHER_WIDTH - ACTION_LAUNCHER_VIEWPORT_PADDING),
                );
        const side: "left" | "right" = left < roomLabelWidth + placement.left ? "left" : "right";
        const desiredTop = laneTop + Math.max(ACTION_LAUNCHER_GAP, placement.top - 4);
        const minTop = visibleTop + ACTION_LAUNCHER_VIEWPORT_PADDING;
        const maxTop = Math.max(minTop, visibleBottom - ACTION_LAUNCHER_ESTIMATED_HEIGHT - ACTION_LAUNCHER_VIEWPORT_PADDING);
        return {
          session: placement.session,
          conflicts: conflictsBySession.get(placement.session.id) ?? EMPTY_CONFLICTS,
          left,
          top: Math.min(Math.max(minTop, desiredTop), maxTop),
          side,
        };
      }
      laneTop += lane.laneHeight;
    }

    return null;
  }, [actionSessionId, boardFrameWidth, conflictsBySession, flippedRoomModels, isDraggingSession, laneModels, orientation, roomLabelWidth, zoom.cardHeight]);

  const clearActionLauncherCloseTimer = useCallback(() => {
    if (closeActionLauncherTimerRef.current !== null) {
      window.clearTimeout(closeActionLauncherTimerRef.current);
      closeActionLauncherTimerRef.current = null;
    }
  }, []);

  const closeActionLauncher = useCallback(() => {
    clearActionLauncherCloseTimer();
    setActionSessionId(null);
    setActionLauncherPinned(false);
  }, [clearActionLauncherCloseTimer]);

  useEffect(() => {
    if (isDraggingSession) {
      closeActionLauncher();
    }
  }, [closeActionLauncher, isDraggingSession]);

  const toggleRoomExpanded = useCallback(
    (roomId: string) => {
      closeActionLauncher();
      setExpandedRoomIds((current) => {
        const next = new Set(current);
        if (next.has(roomId)) {
          next.delete(roomId);
        } else {
          next.add(roomId);
        }
        return next;
      });
    },
    [closeActionLauncher],
  );

  const handleShowActions = useCallback(
    (sessionId: string) => {
      if (isDraggingSessionRef.current) return;
      clearActionLauncherCloseTimer();
      setActionSessionId((currentSessionId) => {
        if (actionLauncherPinnedRef.current && currentSessionId && currentSessionId !== sessionId) {
          return currentSessionId;
        }
        return sessionId;
      });
    },
    [clearActionLauncherCloseTimer],
  );

  const handleToggleActions = useCallback(
    (sessionId: string) => {
      if (isDraggingSessionRef.current) return;
      clearActionLauncherCloseTimer();
      setActionSessionId((currentSessionId) => {
        const isSameSession = currentSessionId === sessionId;
        const isPinned = actionLauncherPinnedRef.current;
        setActionLauncherPinned(!isSameSession || !isPinned);
        return isSameSession && isPinned ? null : sessionId;
      });
    },
    [clearActionLauncherCloseTimer],
  );

  const scheduleActionLauncherClose = useCallback(
    (sessionId: string) => {
      if (actionLauncherPinnedRef.current) return;
      clearActionLauncherCloseTimer();
      closeActionLauncherTimerRef.current = window.setTimeout(() => {
        closeActionLauncherTimerRef.current = null;
        setActionSessionId((currentSessionId) => (currentSessionId === sessionId ? null : currentSessionId));
      }, ACTION_LAUNCHER_CLOSE_DELAY_MS);
    },
    [clearActionLauncherCloseTimer],
  );

  useEffect(() => {
    return () => {
      clearActionLauncherCloseTimer();
    };
  }, [clearActionLauncherCloseTimer]);

  useEffect(() => {
    if (isTaskDrawerOpen) {
      closeActionLauncher();
    }
  }, [closeActionLauncher, isTaskDrawerOpen]);

  useEffect(() => {
    if (!actionSessionId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (actionLauncherRef.current?.contains(target)) return;

      const sourceSessionCard = target.closest("[data-matrix2-session-card-id]");
      if (sourceSessionCard?.getAttribute("data-matrix2-session-card-id") === actionSessionId) return;

      closeActionLauncher();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeActionLauncher();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionSessionId, closeActionLauncher]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const warnings = Array.from(new Set([...skippedSessionWarnings, ...placementWarnings, ...flippedPlacementWarnings]));
    for (const warning of warnings) {
      console.warn(`[Matrix2] ${warning}`);
    }
  }, [flippedPlacementWarnings, placementWarnings, skippedSessionWarnings]);

  if (boardRooms.length === 0 && sessions.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-sm ring-1 ring-white">
        <div className="text-center">
          <h3 className="text-[22px] leading-[26px] font-semibold text-slate-900">No rooms yet</h3>
          <p className="mt-2 text-[14px] text-slate-500">You can add sessions now and assign rooms later.</p>
          <button
            type="button"
            onClick={onOpenAddRoom}
            disabled={isAddingRoom}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add room
          </button>
        </div>
      </div>
    );
  }

  if (orientation === "TIME_BY_ROOM") {
    return (
      <div
        ref={(node) => {
          boardFrameRef.current = node;
          updateBoardFrameWidth(node);
        }}
        data-matrix2-board-scroll
        data-matrix2-board-orientation="TIME_BY_ROOM"
        className="overflow-x-auto overflow-y-hidden pb-5 rounded-[1.35rem] border border-slate-200/80 bg-slate-50/80 shadow-sm ring-1 ring-white"
        onClick={() => {
          closeActionLauncher();
          onClearSelection();
        }}
      >
        <div className="relative" style={{ minWidth: TIME_LABEL_WIDTH + flippedBoardWidth }}>
          <div className="sticky top-0 z-20 flex border-b border-slate-300/80 bg-slate-100/95 shadow-[0_8px_22px_rgba(15,23,42,0.045)] backdrop-blur">
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end border-r border-slate-300/80 bg-slate-100/95 px-2.5 py-2"
              style={{ width: TIME_LABEL_WIDTH }}
            >
              <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Time</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenAddRoom();
                  }}
                  disabled={isAddingRoom}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-[#28439A]/25 hover:bg-slate-50 disabled:opacity-50"
                  title="Add room"
                  aria-label="Add room"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="relative h-12 shrink-0" style={{ width: flippedBoardWidth, minWidth: flippedBoardWidth }}>
              {flippedRoomModels.map(({ room, roomSessions, left, width }) => {
                const isVirtualRoom = room.isVirtual === true;
                return (
                  <div
                    key={`room-header-${room.id}`}
                    className="absolute top-0 bottom-0 border-r border-slate-300/80 bg-slate-100/95 px-1.5 py-1"
                    style={{ left, width }}
                  >
                    <div className="h-full rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                      <div className="flex items-start justify-between gap-1">
                        <p className="truncate text-[12px] leading-[15px] font-semibold text-slate-900">{room.name}</p>
                        {isVirtualRoom ? (
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                            Imported
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenEditRoom(room);
                            }}
                            disabled={isAddingRoom}
                            className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white text-slate-500 transition hover:border-[#28439A]/25 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                            title={`Edit ${room.name}`}
                            aria-label={`Edit room ${room.name}`}
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[9px] leading-[12px] font-medium text-slate-500">
                        {!isVirtualRoom ? (
                          <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5">Cap {room.capacity ?? "N/A"}</span>
                        ) : null}
                        <span className="min-w-0 truncate rounded-full bg-white px-1.5 py-0.5">{roomSessions.length} sessions</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex">
            <div
              className="sticky left-0 z-30 shrink-0 border-r border-slate-300/80 bg-slate-100/90"
              style={{ width: TIME_LABEL_WIDTH, minHeight: flippedTimelineHeight }}
            >
              <div className="relative" style={{ height: flippedTimelineHeight }}>
                {timeWindow.ticks.map((tickMinutes, tickIndex) => {
                  const tickLayout = computeMatrix2TimelineRangeLayout({
                    startMinutes: tickMinutes,
                    endMinutes: tickMinutes + 1,
                    windowStartMinutes: timeWindow.startMinutes,
                    windowEndMinutes: timeWindow.endMinutes,
                    minuteWidth: timeByRoomMinuteHeight,
                  });
                  const top = tickLayout.left;
                  const shouldShowLabel = tickIndex % timeByRoomLabelEveryHours === 0;
                  return (
                    <div key={`time-axis-${tickMinutes}`} className="absolute right-0 left-0" style={{ top }}>
                      <div className={tickMinutes === 720 ? "border-t-2 border-[#28439A]/35" : tickMinutes % 120 === 0 ? "border-t border-slate-300/90" : "border-t border-slate-200/75"} />
                      {shouldShowLabel ? (
                        <span className="absolute top-1 left-2 text-[10px] font-semibold tracking-wide text-slate-500">
                          {formatTimeLabel(`${String(Math.floor(tickMinutes / 60)).padStart(2, "0")}:${String(tickMinutes % 60).padStart(2, "0")}`)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="relative isolate shrink-0 overflow-hidden bg-white"
              style={{ width: flippedBoardWidth, minWidth: flippedBoardWidth, height: flippedTimelineHeight, minHeight: flippedTimelineHeight }}
              onClick={() => {
                closeActionLauncher();
                onClearSelection();
              }}
            >
              {timeWindow.ticks.map((tickMinutes) => {
                const tickLayout = computeMatrix2TimelineRangeLayout({
                  startMinutes: tickMinutes,
                  endMinutes: tickMinutes + 1,
                  windowStartMinutes: timeWindow.startMinutes,
                  windowEndMinutes: timeWindow.endMinutes,
                  minuteWidth: timeByRoomMinuteHeight,
                });
                const top = tickLayout.left;
                return (
                  <div
                    key={`flipped-grid-time-${tickMinutes}`}
                    className={[
                      "absolute right-0 left-0",
                      tickMinutes === 720 ? "border-t-2 border-[#28439A]/35" : tickMinutes % 120 === 0 ? "border-t border-slate-300/90" : "border-t border-slate-200/60",
                    ].join(" ")}
                    style={{ top }}
                  />
                );
              })}

              {flippedRoomModels.map(({ room, left, width }, roomIndex) => (
                <div
                  key={`flipped-grid-room-${room.id}`}
                  className={`absolute top-0 bottom-0 border-l border-slate-200/65 ${roomIndex % 2 === 0 ? "bg-white/35" : "bg-slate-50/65"}`}
                  style={{ left, width }}
                />
              ))}

              {flippedRoomModels.flatMap(({ room, left, width }) => (
                Array.from(
                  { length: Math.max(1, Math.ceil((timeWindow.endMinutes - timeWindow.startMinutes) / DROP_SLOT_MINUTES)) },
                  (_, slotIndex) => {
                    const startMinutes = timeWindow.startMinutes + slotIndex * DROP_SLOT_MINUTES;
                    if (startMinutes >= timeWindow.endMinutes) return null;

                    const dropLayout = computeMatrix2TimelineRangeLayout({
                      startMinutes,
                      endMinutes: startMinutes + DROP_SLOT_MINUTES,
                      windowStartMinutes: timeWindow.startMinutes,
                      windowEndMinutes: timeWindow.endMinutes,
                      minuteWidth: timeByRoomMinuteHeight,
                    });

                    return (
                      <FlippedSlotDropCell
                        key={`${room.id}-${startMinutes}`}
                        room={room}
                        startMinutes={startMinutes}
                        left={left}
                        width={width}
                        top={dropLayout.left}
                        height={dropLayout.width}
                        isDraggingAny={isDraggingAny && room.isVirtual !== true}
                        disabled={room.isVirtual === true}
                      />
                    );
                  },
                )
              ))}

              {flippedRoomModels.flatMap((roomModel) => (
                roomModel.placements.map(({ session, left, width, top, height }) => {
                  const conflicts = conflictsBySession.get(session.id) ?? EMPTY_CONFLICTS;
                  const isSelected = session.id === selectedSessionId;

                  return (
                    <SessionCard
                      key={session.id}
                      session={session}
                      conflicts={conflicts}
                      left={roomModel.left + left}
                      width={width}
                      top={top}
                      height={height ?? zoom.cardHeight}
                      titleClassName={zoom.titleClassName}
                      density="compact-time"
                      isSelected={isSelected}
                      isDragDisabled={isDraggingTemplate}
                      isGhosted={activeDragSessionId === session.id}
                      onConsumeSessionDragClick={onConsumeSessionDragClick}
                      onShowActions={handleShowActions}
                      onToggleActions={handleToggleActions}
                      onHideActions={scheduleActionLauncherClose}
                      onCloseActions={closeActionLauncher}
                    />
                  );
                })
              ))}
            </div>
          </div>

          {activeLauncher ? (
            <div className="pointer-events-none absolute inset-0 z-50">
              <SessionActionLauncher
                session={activeLauncher.session}
                conflicts={activeLauncher.conflicts}
                left={activeLauncher.left}
                top={activeLauncher.top}
                popoverRef={actionLauncherRef}
                side={activeLauncher.side}
                onPointerEnter={clearActionLauncherCloseTimer}
                onPointerLeave={() => scheduleActionLauncherClose(activeLauncher.session.id)}
                onClose={closeActionLauncher}
                onSessionAction={onSessionAction}
                onDeleteSession={onDeleteSession}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={(node) => {
        boardFrameRef.current = node;
        updateBoardFrameWidth(node);
      }}
      data-matrix2-board-scroll
      data-matrix2-board-orientation="ROOMS_BY_TIME"
      className="overflow-x-auto overflow-y-hidden pb-5 rounded-[1.35rem] border border-slate-200/80 bg-slate-50/80 shadow-sm ring-1 ring-white"
      onClick={() => {
        closeActionLauncher();
        onClearSelection();
      }}
    >
      <div className="relative" style={{ minWidth: roomLabelWidth + timelineWidth }}>
        <div className="sticky top-0 z-20 flex border-b border-slate-300/80 bg-slate-100/95 shadow-[0_8px_22px_rgba(15,23,42,0.045)] backdrop-blur">
          <div
            className="sticky left-0 z-30 flex shrink-0 items-end border-r border-slate-300/80 bg-slate-100/95 px-2.5 py-2"
            style={{ width: roomLabelWidth }}
          >
            <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Rooms</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenAddRoom();
                }}
                disabled={isAddingRoom}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-[#28439A]/25 hover:bg-slate-50 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add room
              </button>
            </div>
          </div>
          <div className="relative h-12 shrink-0" style={{ width: timelineWidth, minWidth: timelineWidth }}>
            {timeWindow.ticks.map((tickMinutes, tickIndex) => {
              const tickLayout = computeMatrix2TimelineRangeLayout({
                startMinutes: tickMinutes,
                endMinutes: tickMinutes + 1,
                windowStartMinutes: timeWindow.startMinutes,
                windowEndMinutes: timeWindow.endMinutes,
                minuteWidth: minuteWidthEff,
              });
              const left = tickLayout.left;
              const isLastTick = tickIndex === timeWindow.ticks.length - 1;
              const shouldShowLabel = tickIndex % labelEveryHours === 0;
              return (
              <div key={`tick-${tickMinutes}`} className="absolute top-0 bottom-0" style={{ left }}>
                  <div className={tickMinutes === 720 ? "h-full border-l-2 border-[#28439A]/35 bg-[#28439A]/[0.025]" : tickMinutes % 120 === 0 ? "h-full border-l border-slate-300/90" : "h-full border-l border-slate-200/75"} />
                  <div className={tickMinutes === 720 ? "absolute bottom-0 left-0 h-2 border-l-2 border-[#28439A]/45" : "absolute bottom-0 left-0 h-2 border-l border-slate-300/80"} />
                  {shouldShowLabel ? (
                    <span className={["absolute top-2 text-[10px] font-semibold tracking-wide text-slate-500", isLastTick ? "right-2 text-right" : "left-2"].join(" ")}>
                      {formatTimeLabel(`${String(Math.floor(tickMinutes / 60)).padStart(2, "0")}:${String(tickMinutes % 60).padStart(2, "0")}`)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {laneModels.map(({ room, roomSessions, laneHeight, placements, hiddenSessionCount, isExpanded, isExpandable }, laneIndex) => {
          const isVirtualRoom = room.isVirtual === true;
          return (
            <div key={room.id} className="flex border-b border-slate-200/70 last:border-b-0">
              <div
                className="sticky left-0 z-30 shrink-0 border-r border-slate-300/80 bg-slate-100/90 px-1.5 py-1"
                style={{ width: roomLabelWidth, minHeight: laneHeight }}
              >
                <div className="rounded-lg border border-slate-200/80 bg-white px-1.5 py-1 shadow-sm transition hover:border-slate-300">
                  <div className="flex items-start justify-between gap-1">
                    <p className="truncate text-[12px] leading-[15px] font-semibold text-slate-900">{room.name}</p>
                    {isVirtualRoom ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        Imported
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenEditRoom(room);
                        }}
                        disabled={isAddingRoom}
                        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white text-slate-500 transition hover:border-[#28439A]/25 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                        title={`Edit ${room.name}`}
                        aria-label={`Edit room ${room.name}`}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[9px] leading-[12px] font-medium text-slate-500">
                    {!isVirtualRoom ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5">Cap {room.capacity ?? "N/A"}</span>
                    ) : null}
                    <span className="min-w-0 truncate rounded-full bg-slate-100 px-1.5 py-0.5">{roomSessions.length} sessions</span>
                  </div>
                  {isExpandable ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleRoomExpanded(room.id);
                      }}
                      className="mt-1 inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-600 transition hover:border-[#28439A]/25 hover:bg-white hover:text-[#28439A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A]/25"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Collapse stacked sessions in ${room.name}` : `Expand ${hiddenSessionCount} more sessions in ${room.name}`}
                    >
                      {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{isExpanded ? "Collapse" : `+${hiddenSessionCount} more`}</span>
                    </button>
                  ) : null}
                </div>
              </div>

              <div
                className={[
                  "relative isolate shrink-0 overflow-hidden",
                  laneIndex % 2 === 0 ? "bg-white" : "bg-slate-50/55",
                ].join(" ")}
                style={{ minHeight: laneHeight, width: timelineWidth, minWidth: timelineWidth }}
                onClick={() => {
                  closeActionLauncher();
                  onClearSelection();
                }}
              >
                {timeWindow.ticks.map((tickMinutes) => {
                  const tickLayout = computeMatrix2TimelineRangeLayout({
                    startMinutes: tickMinutes,
                    endMinutes: tickMinutes + 1,
                    windowStartMinutes: timeWindow.startMinutes,
                    windowEndMinutes: timeWindow.endMinutes,
                    minuteWidth: minuteWidthEff,
                  });
                  const left = tickLayout.left;
                  return (
                    <div
                      key={`${room.id}-grid-${tickMinutes}`}
                    className={[
                      "absolute top-0 bottom-0",
                      tickMinutes === 720 ? "border-l-2 border-[#28439A]/35 bg-[#28439A]/[0.025]" : tickMinutes % 120 === 0 ? "border-l border-slate-300/90" : "border-l border-slate-200/60",
                    ].join(" ")}
                      style={{ left }}
                    />
                  );
                })}

                {Array.from(
                  { length: Math.max(1, Math.ceil((timeWindow.endMinutes - timeWindow.startMinutes) / DROP_SLOT_MINUTES)) },
                  (_, slotIndex) => {
                    const startMinutes = timeWindow.startMinutes + slotIndex * DROP_SLOT_MINUTES;
                    if (startMinutes >= timeWindow.endMinutes) return null;

                    const dropLayout = computeMatrix2TimelineRangeLayout({
                      startMinutes,
                      endMinutes: startMinutes + DROP_SLOT_MINUTES,
                      windowStartMinutes: timeWindow.startMinutes,
                      windowEndMinutes: timeWindow.endMinutes,
                      minuteWidth: minuteWidthEff,
                    });
                    const left = dropLayout.left;
                    const width = dropLayout.width;

                    return (
                      <SlotDropCell
                        key={`${room.id}-${startMinutes}`}
                        room={room}
                        startMinutes={startMinutes}
                        left={left}
                        width={width}
                        laneHeight={laneHeight}
                        isDraggingAny={isDraggingAny && !isVirtualRoom}
                        disabled={isVirtualRoom}
                      />
                    );
                  },
                )}

                {placements.map(({ session, left, width, top }) => {
                  const conflicts = conflictsBySession.get(session.id) ?? EMPTY_CONFLICTS;
                  const isSelected = session.id === selectedSessionId;

                  return (
                    <SessionCard
                      key={session.id}
                      session={session}
                      conflicts={conflicts}
                      left={left}
                      width={width}
                      top={top}
                      height={zoom.cardHeight}
                      titleClassName={zoom.titleClassName}
                      isSelected={isSelected}
                      isDragDisabled={isDraggingTemplate}
                      isGhosted={activeDragSessionId === session.id}
                      onConsumeSessionDragClick={onConsumeSessionDragClick}
                      onShowActions={handleShowActions}
                      onToggleActions={handleToggleActions}
                      onHideActions={scheduleActionLauncherClose}
                      onCloseActions={closeActionLauncher}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {activeLauncher ? (
          <div className="pointer-events-none absolute inset-0 z-50">
            <SessionActionLauncher
              session={activeLauncher.session}
              conflicts={activeLauncher.conflicts}
              left={activeLauncher.left}
              top={activeLauncher.top}
              popoverRef={actionLauncherRef}
              side={activeLauncher.side}
              onPointerEnter={clearActionLauncherCloseTimer}
              onPointerLeave={() => scheduleActionLauncherClose(activeLauncher.session.id)}
              onClose={closeActionLauncher}
              onSessionAction={onSessionAction}
              onDeleteSession={onDeleteSession}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const SlotDropCell = memo(function SlotDropCell({
  room,
  startMinutes,
  left,
  width,
  laneHeight,
  isDraggingAny,
  disabled,
}: {
  room: Matrix2BoardRoomGroup;
  startMinutes: number;
  left: number;
  width: number;
  laneHeight: number;
  isDraggingAny: boolean;
  disabled?: boolean;
}) {
  const data: Matrix2TemplateDropTarget = {
    type: "matrix2-slot-drop",
    roomId: room.id,
    roomName: room.name,
    startMinutes,
  };

  const { isOver, setNodeRef } = useDroppable({
    id: `matrix2-drop:${room.id}:${startMinutes}`,
    data,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "absolute top-0 border border-transparent transition-colors",
        isDraggingAny ? "bg-[#28439A]/[0.035]" : "bg-transparent",
        isOver ? "border-[#28439A]/45 bg-[#28439A]/10 shadow-[inset_0_0_0_1px_rgba(40,67,154,0.16)]" : "",
      ].join(" ")}
      style={{
        left,
        width,
        height: laneHeight,
      }}
    />
  );
});

const FlippedSlotDropCell = memo(function FlippedSlotDropCell({
  room,
  startMinutes,
  left,
  width,
  top,
  height,
  isDraggingAny,
  disabled,
}: {
  room: Matrix2BoardRoomGroup;
  startMinutes: number;
  left: number;
  width: number;
  top: number;
  height: number;
  isDraggingAny: boolean;
  disabled?: boolean;
}) {
  const data: Matrix2TemplateDropTarget = {
    type: "matrix2-slot-drop",
    roomId: room.id,
    roomName: room.name,
    startMinutes,
  };

  const { isOver, setNodeRef } = useDroppable({
    id: `matrix2-drop-flipped:${room.id}:${startMinutes}`,
    data,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "absolute border border-transparent transition-colors",
        isDraggingAny ? "bg-[#28439A]/[0.035]" : "bg-transparent",
        isOver ? "border-[#28439A]/45 bg-[#28439A]/10 shadow-[inset_0_0_0_1px_rgba(40,67,154,0.16)]" : "",
      ].join(" ")}
      style={{
        left,
        width,
        top,
        height,
      }}
    />
  );
});

function launcherTileClasses(
  launcherVariant: Matrix2QuickModuleLauncherVariant,
  tone?: ReadinessTone,
): string {
  if (launcherVariant === "workflow-link") return "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200 hover:text-slate-800";
  if (tone === "ready") return "bg-emerald-50 text-emerald-800 ring-emerald-100 hover:bg-emerald-100";
  if (tone === "attention") return "bg-amber-50 text-amber-800 ring-amber-100 hover:bg-amber-100";
  if (tone === "missing") return "bg-rose-50 text-rose-700 ring-rose-100 hover:bg-rose-100";
  return "bg-slate-50 text-slate-800 ring-slate-100 hover:bg-slate-100";
}

function launcherIconPillClasses(
  launcherVariant: Matrix2QuickModuleLauncherVariant,
  tone?: ReadinessTone,
): string {
  if (launcherVariant === "workflow-link") return "bg-slate-200 text-slate-500";
  if (tone === "ready") return "bg-emerald-100 text-emerald-700";
  if (tone === "attention") return "bg-amber-100 text-amber-700";
  if (tone === "missing") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-500";
}

function readableSessionLabel(session: Matrix2Session): string {
  const source = `${session.title} ${session.sessionType}`.toLowerCase();
  if (source.includes("keynote")) return "Keynote";
  if (source.includes("workshop")) return "Workshop";
  if (source.includes("coffee")) return "Coffee";
  if (source.includes("lunch")) return "Lunch";
  if (source.includes("reception")) return "Reception";
  if (source.includes("panel")) return "Panel";

  const firstWords = session.title.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  if (firstWords.length > 0 && firstWords.length <= 18) return firstWords;
  return session.sessionType.trim() || "Session";
}

export function SessionActionLauncher({
  session,
  conflicts,
  left,
  top,
  popoverRef,
  side,
  onPointerEnter,
  onPointerLeave,
  onClose,
  onSessionAction,
  onDeleteSession,
}: {
  session: Matrix2Session;
  conflicts: Matrix2Conflict[];
  left: number;
  top: number;
  popoverRef: Ref<HTMLDivElement>;
  side: "left" | "right";
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClose: () => void;
  onSessionAction: (sessionId: string, action: Matrix2SessionAction) => void;
  onDeleteSession: (sessionId: string) => void;
}) {
  const readinessByAction = deriveMatrix2SessionReadiness(session, conflicts);
  const actionTiles = MATRIX2_QUICK_MODULES.map((module) => {
    const moduleReadiness = readinessByAction[module.action];
    return {
      ...module,
      status: moduleReadiness.status,
      tone: moduleReadiness.tone,
      launcherVariant: module.launcherVariant ?? "module",
      statusLabel: module.launcherTooltip ?? moduleReadiness.label,
      disabled: !module.enabled || !isSessionModuleAvailable(module.action),
    };
  });
  const sessionContext = [session.title, session.roomName].filter((value) => value.trim().length > 0).join(" · ");

  return (
    <div
      ref={popoverRef}
      data-matrix2-action-launcher
      className="pointer-events-auto absolute z-50 w-[min(340px,calc(100vw-24px))] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200/90 bg-white/95 p-3 text-slate-700 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-slate-950/5 backdrop-blur"
      style={{ left, top }}
      role="group"
      aria-label={`Quick actions for ${session.title}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        aria-hidden
        className={[
          "absolute top-0 h-full",
          side === "right" ? "right-full" : "left-full",
        ].join(" ")}
        style={{ width: ACTION_LAUNCHER_HOVER_BRIDGE_PX }}
      />
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">JUMP INTO</span>
        <span className="min-w-0 truncate text-right text-[12px] font-medium text-slate-400">{sessionContext}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {actionTiles.map((item) => {
          const Icon = item.icon;
          const isComingSoonModule = item.disabled
            && (item.action === "room-set" || item.action === "seating");

          if (isComingSoonModule) {
            return (
              <div
                key={item.action}
                data-matrix2-coming-soon-action={item.action}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#f4f7ff] px-2.5 py-1.5 text-left text-[#243d8e] ring-1 ring-[#d8e1ff]"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e6edff] text-[#28439a]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{item.label}</span>
                  <span className="block text-[10px] font-medium text-[#5266a8]">Coming soon</span>
                </span>
              </div>
            );
          }

          if (item.disabled) {
            return (
              <div
                key={item.action}
                data-matrix2-disabled-action={item.action}
                aria-disabled="true"
                tabIndex={-1}
                className="pointer-events-none inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-xl bg-slate-100 px-2.5 text-left text-[14px] font-semibold text-slate-400 ring-1 ring-slate-200"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
              </div>
            );
          }
          return (
            <button
              key={item.action}
              type="button"
              data-matrix2-action={item.action}
              data-readiness-status={item.status}
              data-readiness-tone={item.tone}
              onClick={() => {
                onClose();
                onSessionAction(session.id, item.action);
              }}
              title={item.statusLabel}
              className={[
                "inline-flex h-11 items-center gap-2 rounded-xl px-2.5 text-left text-[14px] font-semibold ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A]/25",
                launcherTileClasses(item.launcherVariant, item.tone),
              ].join(" ")}
            >
              <span data-readiness-icon={item.action} className={["inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", launcherIconPillClasses(item.launcherVariant, item.tone)].join(" ")}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200/80 pt-2.5">
        <button
          type="button"
          onClick={() => {
            onClose();
            onSessionAction(session.id, "workspace");
          }}
          className="min-w-0 truncate text-left text-[13px] font-semibold text-[#28439A] transition hover:text-[#1f367d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28439A]/25"
        >
          Open full workspace →
        </button>
        <span className="sr-only">Choose a card</span>
        <button
          type="button"
          onClick={() => {
            onClose();
            onDeleteSession(session.id);
          }}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
          aria-label={`Archive ${session.title}`}
          title="Archive session"
        >
          <Archive className="h-3.5 w-3.5" aria-hidden />
          Archive
        </button>
      </div>
    </div>
  );
}

const SessionCard = memo(function SessionCard({
  session,
  conflicts,
  left,
  width,
  top,
  height,
  titleClassName,
  density = "standard",
  isSelected,
  isDragDisabled,
  isGhosted,
  onConsumeSessionDragClick,
  onShowActions,
  onToggleActions,
  onHideActions,
  onCloseActions,
}: {
  session: Matrix2Session;
  conflicts: Matrix2Conflict[];
  left: number;
  width: number;
  top: number;
  height: number;
  titleClassName: string;
  density?: "standard" | "compact-time";
  isSelected: boolean;
  isDragDisabled: boolean;
  isGhosted: boolean;
  onConsumeSessionDragClick: () => boolean;
  onShowActions: (sessionId: string) => void;
  onToggleActions: (sessionId: string) => void;
  onHideActions: (sessionId: string) => void;
  onCloseActions: () => void;
}) {
  // Derive the conflict summary inside the memoized card from the (stable) conflicts
  // prop so the board does not have to allocate a fresh summary object per render.
  const summary = useMemo(() => conflictSummary(conflicts), [conflicts]);
  const startMinutes = toMinutes(session.startTime) ?? 0;
  const formattedTimeRange = `${formatTimeLabel(session.startTime)}–${formatTimeLabel(session.endTime)}`;
  const isTimeByRoomCard = density === "compact-time";
  const durationSize = isTimeByRoomCard ? height : width;
  const isTinyDuration = durationSize < (isTimeByRoomCard ? TIME_BY_ROOM_SESSION_CARD_TINY_HEIGHT : 80);
  const isSmallCard = isTimeByRoomCard ? height < TIME_BY_ROOM_SESSION_CARD_MEDIUM_HEIGHT : width < SESSION_CARD_MEDIUM_WIDTH;
  const cardTitle = isTinyDuration ? readableSessionLabel(session) : session.title;
  const canUseTwoLineTitle = isTimeByRoomCard
    ? height >= TIME_BY_ROOM_SESSION_CARD_MEDIUM_HEIGHT
    : width >= SESSION_CARD_MEDIUM_WIDTH;
  const titleClampClass = canUseTwoLineTitle ? "line-clamp-2" : "truncate";
  const titlePaddingClass = summary.total > 0 ? (isSmallCard ? "pr-5" : "pr-7") : "";
  const timeLabel = isTimeByRoomCard
    ? height >= TIME_BY_ROOM_SESSION_CARD_MEDIUM_HEIGHT
      ? formattedTimeRange
      : height >= TIME_BY_ROOM_SESSION_CARD_START_TIME_HEIGHT
        ? formatTimeLabel(session.startTime)
        : null
    : width >= 92
      ? formattedTimeRange
      : width >= 64
        ? formatTimeLabel(session.startTime)
        : null;
  const cardPaddingClass = isTimeByRoomCard ? "px-1.5 py-1" : "px-2 py-1";
  const titleTextClassName = isTimeByRoomCard && isSmallCard ? "text-[11px] leading-[13px]" : titleClassName;
  const timeTextClassName = isTimeByRoomCard ? "mt-0.5 truncate text-[9px] leading-[11px] font-semibold text-current/70" : "mt-0.5 truncate text-[10px] leading-[12px] font-semibold text-current/70";

  const dropData: Matrix2SessionDropTarget = {
    type: "matrix2-session-drop",
    sessionId: session.id,
    roomId: session.roomId ?? "",
    roomName: session.roomName,
    startMinutes,
    sortOrder: session.sortOrder,
  };

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `matrix2-session-drop:${session.id}`,
    data: dropData,
    disabled: isDragDisabled,
  });

  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({
    id: `matrix2-session:${session.id}`,
    data: {
      type: "matrix2-session",
      sessionId: session.id,
    },
    disabled: isDragDisabled,
  });
  const { onPointerDown: onDragPointerDown, ...dragListeners } = listeners ?? {};

  const conflictAccentClass = summary.total > 0
    ? isSelected
      ? "border-t-2 border-t-rose-400 shadow-[0_-2px_10px_rgba(244,63,94,0.16)]"
      : "border-t-2 border-t-rose-200 shadow-[0_-1px_6px_rgba(244,63,94,0.08)]"
    : "border-t-slate-200/90";

  const ringTone = isSelected ? "ring-2 ring-[#28439A]/75 ring-offset-2 ring-offset-white" : "ring-1 ring-white/70";

  const conflictDescId = `m2-session-${session.id}-conflicts-desc`;
  const conflictLines = uniqueConflictMessages(conflicts);
  const conflictTone = getPlanningTone("Conflict", { intent: "conflict" }).className;
  const dragDescribedBy =
    typeof attributes["aria-describedby"] === "string" && attributes["aria-describedby"].trim().length > 0
      ? attributes["aria-describedby"]
      : "";
  const mergedDescribedBy =
    [dragDescribedBy, summary.total > 0 ? conflictDescId : ""].filter((value) => value.length > 0).join(" ") ||
    undefined;

  return (
    <button
      ref={(node) => {
        setDropRef(node);
        setDragRef(node);
      }}
      data-matrix2-session-card-id={session.id}
      type="button"
      {...dragListeners}
      {...attributes}
      aria-describedby={isDragging ? dragDescribedBy || undefined : mergedDescribedBy}
      aria-label={`${session.title}, ${formattedTimeRange}`}
      title={isDragging ? undefined : `${session.title} · ${formattedTimeRange}`}
      onPointerDown={(event) => {
        if (isMatrix2SessionCardNestedInteractiveControl(event.target, event.currentTarget)) return;
        onDragPointerDown?.(event);
      }}
      onPointerEnter={() => {
        if (!isDragging) onShowActions(session.id);
      }}
      onPointerLeave={() => {
        if (!isDragging) onHideActions(session.id);
      }}
      onFocus={() => {
        if (!isDragging) onShowActions(session.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCloseActions();
        }
      }}
      onClickCapture={(event) => {
        if (!onConsumeSessionDragClick()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.defaultPrevented) return;
        if (onConsumeSessionDragClick()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onToggleActions(session.id);
      }}
      className={[
        "absolute z-[2] overflow-visible rounded-[9px] border border-slate-200/90 text-left transition",
        cardPaddingClass,
        sessionCardTypeClasses(session.sessionType),
        conflictAccentClass,
        ringTone,
        isDragging ? "z-[50] cursor-grabbing opacity-35 shadow-xl pointer-events-none" : "cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow-[0_8px_16px_rgba(15,23,42,0.11)]",
        isGhosted ? "opacity-0" : "",
        isOver ? "ring-2 ring-[#28439A]/45 ring-offset-2 ring-offset-white" : "",
      ].join(" ")}
      style={{
        left,
        width,
        top,
        height,
      }}
    >
      {summary.total > 0 ? (
        <span id={conflictDescId} className="sr-only">
          {conflictLines.join(". ")}
        </span>
      ) : null}
      <div className="flex h-full min-w-0 flex-col justify-center overflow-hidden">
        <div className={["min-w-0", titlePaddingClass].join(" ")}>
          <p className={[titleClampClass, "font-semibold", titleTextClassName].join(" ")}>
            {cardTitle}
          </p>
          {timeLabel ? (
            <p className={timeTextClassName}>
              {timeLabel}
            </p>
          ) : null}
        </div>
        {summary.total > 0 && !isDragging ? (
          <span className={["group/badge absolute right-1 z-10", isTimeByRoomCard ? "top-0.5" : "top-1"].join(" ")}>
            <span className={`inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full px-1 text-[9px] font-semibold shadow-sm ${conflictTone}`} aria-hidden>
              <AlertTriangle className="h-2.5 w-2.5" />
              {summary.total}
            </span>
            <span
              aria-hidden
              className={[
                "pointer-events-none invisible absolute right-0 bottom-full z-[60] mb-1",
                "w-max min-w-[10rem] max-w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 text-[10px] leading-snug shadow-xl ring-1 ring-slate-900/5",
                "opacity-0 transition duration-150",
                "group-hover/badge:visible group-hover/badge:opacity-100",
              ].join(" ")}
            >
              <MatrixConflictTooltipList conflicts={conflicts} />
            </span>
          </span>
        ) : null}
      </div>
    </button>
  );
});

// Memoized so unrelated page-level state changes (flash toasts, mutation flags, drawer
// open/close) do not re-render the entire board tree. Effective only because page.tsx
// passes stable props/handlers (memoized arrays/maps + useCallback board callbacks).
export default memo(Matrix2Board);
