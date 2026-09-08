/**
 * Pure helper for chunked (multipart) conversation uploads.
 *
 * Extracted from the chunked `complete` route so the missing-part detection — the safety check
 * that prevents finalizing a recording before every chunk has actually landed in storage — can
 * be unit-tested directly (the route imports `server-only`/R2 and cannot run in node:test).
 *
 * Returns the 1-based part numbers in [1..totalParts] that are NOT present in the uploaded set.
 */
export function findMissingPartNumbers(totalParts: number, uploadedPartNumbers: number[]): number[] {
  const uploadedSet = new Set(uploadedPartNumbers);
  const missing: number[] = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (!uploadedSet.has(partNumber)) {
      missing.push(partNumber);
    }
  }
  return missing;
}
