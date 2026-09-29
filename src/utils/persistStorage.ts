// Best-effort request that the browser not evict this origin's storage
// under pressure. Supported in Chromium/Firefox, silent no-op elsewhere
// (e.g. Safari). Does NOT survive a user manually clearing site data —
// only reduces the chance of automatic eviction.
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Non-fatal — the app works identically either way.
  }
}
