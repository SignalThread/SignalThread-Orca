/**
 * Deterministic compare for staged row matrices (revision bumps, equality checks).
 */
export function cellsMatricesEqual(a: string[][], b: string[][]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
