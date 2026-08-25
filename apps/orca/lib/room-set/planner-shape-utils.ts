export type PlannerTheaterSeatMarker = Readonly<{
  facing: "front";
  seatKind: "chair";
  seatIndex: number;
}>;

export function plannerTheaterSeatCountFromCapacity(capacitySeated: number): number {
  return Math.max(1, Math.min(80, Math.round(capacitySeated)));
}

export function plannerTheaterSeatMarkersFromCapacity(
  capacitySeated: number,
): PlannerTheaterSeatMarker[] {
  return Array.from(
    { length: plannerTheaterSeatCountFromCapacity(capacitySeated) },
    (_, seatIndex) => ({
      facing: "front",
      seatKind: "chair",
      seatIndex,
    }),
  );
}
