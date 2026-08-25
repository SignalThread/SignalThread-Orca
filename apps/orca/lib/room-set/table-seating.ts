import type { RoomSetSpatialObject } from "./spatial-types";

/** Browser-local planner metadata — not persisted server-side */
export const SEAT_PLAN_META_KEY = "seatPlanV1";

export type SeatPlanV1 = {
  occupiedSeats: number;
  /** Seat indices counted from 0 upward that show attendee placeholders */
  assignedSeatIndices: number[];
};

export function readSeatPlan(meta: Record<string, unknown> | undefined): SeatPlanV1 {
  const raw = meta?.[SEAT_PLAN_META_KEY];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { occupiedSeats: 0, assignedSeatIndices: [] };
  }

  const o = raw as Record<string, unknown>;
  const occ = typeof o.occupiedSeats === "number" && Number.isFinite(o.occupiedSeats) ? o.occupiedSeats : 0;
  const assignedRaw = o.assignedSeatIndices;

  const assignedNums: number[] = Array.isArray(assignedRaw)

    ? assignedRaw.filter((n): n is number => typeof n === "number" && Number.isInteger(n))

    : [];

  return {
    occupiedSeats: Math.max(0, occ),
    assignedSeatIndices: [...new Set(assignedNums)].sort((a, b) => a - b),

  };
}

export function writeSeatPlanMetadata(
  meta: Record<string, unknown>,
  plan: SeatPlanV1,
): Record<string, unknown> {
  return {
    ...meta,
    [SEAT_PLAN_META_KEY]: plan,
  };
}

/** Total guest seats modeled on this asset (capacity row in inspector). */
export function seatCapacityFromObject(obj: RoomSetSpatialObject): number {
  if (obj.capacityContribution.mode !== "seated") return 0;

  return Math.max(0, Math.round(obj.capacityContribution.seatedGuests));
}

export function clampSeatPlanToCapacity(plan: SeatPlanV1, cap: number): SeatPlanV1 {
  const occupied = Math.min(cap, Math.max(0, plan.occupiedSeats));

  const assigned = plan.assignedSeatIndices.filter((i) => i >= 0 && i < cap);

  return {

    occupiedSeats: occupied,

    assignedSeatIndices: [...new Set(assigned)].sort((a, b) => a - b),
  };
}

function spreadOnEdge(count: number, widthLu: number, yLocal: number): Array<{ lx: number; ly: number }> {

  if (count <= 0) return [];

  const halfW = widthLu / 2 - 3.5;

  if (count === 1) return [{ lx: 0, ly: yLocal }];

  const step = (2 * halfW) / (count - 1);

  const out: Array<{ lx: number; ly: number }> = [];

  for (let i = 0; i < count; i += 1) {
    out.push({ lx: -halfW + step * i, ly: yLocal });
  }

  return out;
}

/** Seat marker offsets in local table space (+X across width axis, +Y across depth axis), pre-rotation. */
export function enumerateSeatLocalsLu(obj: RoomSetSpatialObject): Array<{ lx: number; ly: number }> {


  const cap = seatCapacityFromObject(obj);

  if (cap <= 0) return [];

  const { widthLu: w, heightLu: h } = obj.transform;

  const profile = obj.profile;

  if (obj.type === "chair_block") {
    const cols = Math.max(1, Math.ceil(Math.sqrt(cap * (w / Math.max(h, 0.001)))));

    const rows = Math.ceil(cap / cols);

    const padX = Math.min(w * 0.08, 3);


    const padY = Math.min(h * 0.08, 3);

    const innerW = w - padX * 2;

    const innerH = h - padY * 2;

    const stepX = cols > 1 ? innerW / (cols - 1) : 0;


    const stepY = rows > 1 ? innerH / (rows - 1) : 0;



    const out: Array<{ lx: number; ly: number }> = [];


    let placed = 0;


    outer: for (let r = 0; r < rows; r += 1) {


      for (let c = 0; c < cols; c += 1) {


        const stagger = r % 2 === 0 ? 0 : stepX * 0.22;


        const lx = -innerW / 2 + c * stepX + stagger;


        const ly = -innerH / 2 + r * stepY;


        out.push({ lx, ly });


        placed += 1;


        if (placed >= cap) break outer;


      }


    }


    return out;


  }


  if (profile.objectKind === "table" && profile.spatialClass === "rectilinear_round_table") {
    const ringR = Math.max(w, h) / 2 + 2;
    const out: Array<{ lx: number; ly: number }> = [];

    for (let i = 0; i < cap; i += 1) {
      const theta = (i / cap) * Math.PI * 2 - Math.PI / 2;
      out.push({ lx: ringR * Math.cos(theta), ly: ringR * Math.sin(theta) });


    }



    return out;


  }



  if (profile.objectKind === "table" && profile.spatialClass === "rectilinear_dual_row_table") {


    const topCount = Math.ceil(cap / 2);

    const bottomCount = cap - topCount;



    const yTop = -h / 2 - 2.8;



    const yBot = h / 2 + 2.8;



    const topPts = spreadOnEdge(topCount, w, yTop);

    const botPts = spreadOnEdge(bottomCount, w, yBot);



    return [...topPts, ...botPts];

  }

  return [];
}

export function seatMarkerAnchorsLu(
  obj: RoomSetSpatialObject,
): Array<{ lx: number; ly: number; idx: number; status: "vacant" | "occupied" | "assigned" }> {

  const locals = enumerateSeatLocalsLu(obj);

  const cap = seatCapacityFromObject(obj);

  const plan = clampSeatPlanToCapacity(readSeatPlan(obj.metadata as Record<string, unknown>), cap);

  const assigned = new Set(plan.assignedSeatIndices);

  const occ = Math.min(plan.occupiedSeats, cap);

  return locals.map((spot, idx) => {
    let status: "vacant" | "occupied" | "assigned" = "vacant";
    if (idx < occ) status = assigned.has(idx) ? "assigned" : "occupied";
    return { ...spot, idx, status };
  });
}

export function localToWorldLu(lx: number, ly: number, obj: RoomSetSpatialObject): { x: number; y: number } {
  const rad = obj.transform.rotationDeg * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: obj.transform.cx + lx * cos - ly * sin,
    y: obj.transform.cy + lx * sin + ly * cos,
  };
}
