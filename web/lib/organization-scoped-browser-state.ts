const ORGANIZATION_SCOPED_STORAGE_KEYS = new Set([
  "matrix2:selectedEventId",
  "timeline:selectedEventId",
]);

const ORGANIZATION_SCOPED_STORAGE_PREFIXES = [
  "matrix2:boardOrientation:",
  "planner-os:event-cc-layout:",
  "planner.roomSet:v1:",
];

type BrowserStorage = Pick<Storage, "key" | "length" | "removeItem">;

function isOrganizationScopedStorageKey(key: string | null): key is string {
  return Boolean(
    key &&
      (ORGANIZATION_SCOPED_STORAGE_KEYS.has(key) ||
        ORGANIZATION_SCOPED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))),
  );
}

export function clearOrganizationScopedStorage(storage: BrowserStorage): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (isOrganizationScopedStorageKey(key)) {
      storage.removeItem(key);
    }
  }
}

export function clearOrganizationScopedBrowserState(): void {
  clearOrganizationScopedStorage(window.localStorage);
  clearOrganizationScopedStorage(window.sessionStorage);
}
