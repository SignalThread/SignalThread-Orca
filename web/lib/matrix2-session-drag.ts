/** Pointer movement required before a Run of Show session becomes a drag. */
export const MATRIX2_SESSION_DRAG_ACTIVATION_DISTANCE = 6;

/**
 * Keeps a real drag from leaking its browser-generated click into the next
 * normal card interaction. The pending flag is consumed exactly once.
 */
export function createMatrix2SessionDragClickState() {
  let hasPendingDraggedClick = false;

  return {
    markDragStarted(): void {
      hasPendingDraggedClick = true;
    },
    consumeDraggedClick(): boolean {
      if (!hasPendingDraggedClick) return false;
      hasPendingDraggedClick = false;
      return true;
    },
    clear(): void {
      hasPendingDraggedClick = false;
    },
    get pending(): boolean {
      return hasPendingDraggedClick;
    },
  };
}

export function isMatrix2SessionCardNestedInteractiveControl(target: EventTarget | null, card: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const interactiveControl = target.closest(
    "a, button, input, select, textarea, summary, [role='button'], [data-matrix2-card-interactive]",
  );
  return Boolean(interactiveControl && interactiveControl !== card);
}
