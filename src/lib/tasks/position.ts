/** Gap used between positions when appending or renumbering a column. */
export const POSITION_STEP = 1024;
/** Below this gap we renumber the column instead of halving again. */
export const MIN_POSITION_GAP = 1e-6;

/**
 * Returns a position strictly between two neighbours (either may be missing),
 * or null when the neighbours are too close together and the column must be renumbered.
 */
export function positionBetween(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return POSITION_STEP;
  if (before === null) return (after as number) - POSITION_STEP;
  if (after === null) return before + POSITION_STEP;
  if (after - before <= MIN_POSITION_GAP * 2) return null;
  return before + (after - before) / 2;
}

/** Evenly spaced positions for a column of `count` items, in order. */
export function renumberedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
}

/** Stable comparison used everywhere tasks are ordered within a column. */
export function compareByPosition(
  a: { position: number; id: string },
  b: { position: number; id: string },
): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
