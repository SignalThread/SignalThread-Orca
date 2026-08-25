export type Matrix2SessionBlockLayoutInput = {
  startTime: string;
  endTime: string;
  windowStartMinutes: number;
  windowEndMinutes: number;
  minuteWidth: number;
};

export type Matrix2TimelineRangeLayoutInput = {
  startMinutes: number;
  endMinutes: number;
  windowStartMinutes: number;
  windowEndMinutes: number;
  minuteWidth: number;
};

export type Matrix2SessionBlockLayout = {
  left: number;
  width: number;
  startMinutes: number;
  endMinutes: number;
  clampedStartMinutes: number;
  clampedEndMinutes: number;
  durationMinutes: number;
};

export type Matrix2TimelineScaleInput = {
  containerWidth: number;
  roomColumnWidth: number;
  windowStartMinutes: number;
  windowEndMinutes: number;
  minimumReadableHourWidth?: number;
};

export type Matrix2TimelineScale = {
  availableTimelineWidth: number;
  visibleMinutes: number;
  numberOfVisibleHours: number;
  hourWidth: number;
  labelEveryHours: number;
  minuteWidth: number;
};

export type Matrix2TimeByRoomScaleInput = {
  minimumReadableHourHeight?: number;
};

export type Matrix2TimeByRoomScale = {
  minuteHeight: number;
  hourHeight: number;
  labelEveryHours: number;
};

export type Matrix2TimelineRangeLayout = {
  left: number;
  width: number;
  clampedStartMinutes: number;
  clampedEndMinutes: number;
  durationMinutes: number;
};

export type Matrix2BoardOrientation = "ROOMS_BY_TIME" | "TIME_BY_ROOM";

export type Matrix2BoardAxes = {
  timeAxis: "x" | "y";
  roomAxis: "x" | "y";
};

export type Matrix2BoardCardProjectionInput = {
  orientation: Matrix2BoardOrientation;
  timeOffset: number;
  timeSize: number;
  roomOffset: number;
  roomSize: number;
};

export type Matrix2BoardCardProjection = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const MATRIX2_MIN_READABLE_HOUR_WIDTH = 76;
export const MATRIX2_TIME_BY_ROOM_MINUTE_HEIGHT = 1.2;
export const MATRIX2_TIME_BY_ROOM_MIN_READABLE_HOUR_HEIGHT = 56;

function matrix2TimeToMinutes(timeValue: string): number | null {
  const match = timeValue.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function computeMatrix2TimelineScale(input: Matrix2TimelineScaleInput): Matrix2TimelineScale {
  const minimumReadableHourWidth = input.minimumReadableHourWidth ?? MATRIX2_MIN_READABLE_HOUR_WIDTH;
  const visibleMinutes = Math.max(1, input.windowEndMinutes - input.windowStartMinutes);
  const numberOfVisibleHours = visibleMinutes / 60;
  const availableTimelineWidth = Math.max(1, input.containerWidth - input.roomColumnWidth);
  const hourWidth = availableTimelineWidth / numberOfVisibleHours;
  const labelEveryHours = Math.max(1, Math.ceil(minimumReadableHourWidth / hourWidth));

  return {
    availableTimelineWidth,
    visibleMinutes,
    numberOfVisibleHours,
    hourWidth,
    labelEveryHours,
    minuteWidth: hourWidth / 60,
  };
}

export function computeMatrix2TimeByRoomScale(input: Matrix2TimeByRoomScaleInput = {}): Matrix2TimeByRoomScale {
  const minimumReadableHourHeight = input.minimumReadableHourHeight ?? MATRIX2_TIME_BY_ROOM_MIN_READABLE_HOUR_HEIGHT;
  const hourHeight = MATRIX2_TIME_BY_ROOM_MINUTE_HEIGHT * 60;
  const labelEveryHours = Math.max(1, Math.ceil(minimumReadableHourHeight / hourHeight));

  return {
    minuteHeight: MATRIX2_TIME_BY_ROOM_MINUTE_HEIGHT,
    hourHeight,
    labelEveryHours,
  };
}

export function computeMatrix2TimelineRangeLayout(input: Matrix2TimelineRangeLayoutInput): Matrix2TimelineRangeLayout {
  const startMinutes = Number.isFinite(input.startMinutes) ? input.startMinutes : input.windowStartMinutes;
  const endMinutes = Math.max(Number.isFinite(input.endMinutes) ? input.endMinutes : startMinutes + 1, startMinutes + 1);
  const clampedStartMinutes = Math.max(input.windowStartMinutes, Math.min(input.windowEndMinutes - 1, startMinutes));
  const clampedEndMinutes = Math.max(clampedStartMinutes + 1, Math.min(input.windowEndMinutes, endMinutes));
  const timelineWidth = Math.max(0, (input.windowEndMinutes - input.windowStartMinutes) * input.minuteWidth);
  const left = Math.max(0, (clampedStartMinutes - input.windowStartMinutes) * input.minuteWidth);
  const durationWidth = (clampedEndMinutes - clampedStartMinutes) * input.minuteWidth;
  const availableWidth = Math.max(0, timelineWidth - left);

  return {
    left,
    width: Math.min(Math.max(1, durationWidth), availableWidth),
    clampedStartMinutes,
    clampedEndMinutes,
    durationMinutes: clampedEndMinutes - clampedStartMinutes,
  };
}

export function computeMatrix2SessionBlockLayout(input: Matrix2SessionBlockLayoutInput): Matrix2SessionBlockLayout {
  const startMinutes = matrix2TimeToMinutes(input.startTime) ?? input.windowStartMinutes;
  const endMinutes = Math.max(matrix2TimeToMinutes(input.endTime) ?? startMinutes + 30, startMinutes + 1);
  const rangeLayout = computeMatrix2TimelineRangeLayout({
    startMinutes,
    endMinutes,
    windowStartMinutes: input.windowStartMinutes,
    windowEndMinutes: input.windowEndMinutes,
    minuteWidth: input.minuteWidth,
  });

  return {
    left: rangeLayout.left,
    width: rangeLayout.width,
    startMinutes,
    endMinutes,
    clampedStartMinutes: rangeLayout.clampedStartMinutes,
    clampedEndMinutes: rangeLayout.clampedEndMinutes,
    durationMinutes: rangeLayout.durationMinutes,
  };
}

export function matrix2BoardAxes(orientation: Matrix2BoardOrientation): Matrix2BoardAxes {
  if (orientation === "TIME_BY_ROOM") {
    return {
      timeAxis: "y",
      roomAxis: "x",
    };
  }

  return {
    timeAxis: "x",
    roomAxis: "y",
  };
}

export function computeMatrix2BoardCardProjection(input: Matrix2BoardCardProjectionInput): Matrix2BoardCardProjection {
  const axes = matrix2BoardAxes(input.orientation);
  if (axes.timeAxis === "y") {
    return {
      left: input.roomOffset,
      top: input.timeOffset,
      width: input.roomSize,
      height: input.timeSize,
    };
  }

  return {
    left: input.timeOffset,
    top: input.roomOffset,
    width: input.timeSize,
    height: input.roomSize,
  };
}
