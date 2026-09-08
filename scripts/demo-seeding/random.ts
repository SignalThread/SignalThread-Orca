import { createHash } from 'node:crypto';

/** Stable JSON for configuration/content fingerprints; not a signature or authorization proof. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Fingerprint input must be finite JSON data');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
export function logicalId(namespace: string, key: string): string {
  const bytes = createHash('sha256').update(`${namespace}\0${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Forks isolate generators: adding LR data must not perturb Orca sessions. */
export function seededRandom(seed: string | number) {
  const key = String(seed);
  let state = createHash('sha256').update(key).digest().readUInt32LE(0);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number) {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min || max - min >= 4294967296) throw new Error('Invalid random integer range');
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(values: readonly T[]): T {
      if (!values.length) throw new Error('Cannot select from an empty list');
      return values[Math.floor(next() * values.length)]!;
    },
    fork(label: string) { return seededRandom(`${key}\0${label}`); },
  };
}
