/**
 * cache-tools
 * -----------
 * Solves a specific pain point: on shared machines with no persistent
 * storage (e.g. college lab PCs), transformers.js re-downloads the entire
 * sd-turbo model into the browser's Cache Storage on every fresh session,
 * because Cache Storage is wiped along with everything else.
 *
 * This module lets you snapshot that cache to a single portable file once,
 * then re-hydrate Cache Storage from that file on any machine/session in
 * seconds — no network required, no re-download.
 *
 * Typical flow:
 *   1. On first run on any machine: engine.init() downloads the model as usual.
 *   2. Call exportModelCache() + downloadModelCache() to save a snapshot
 *      file (e.g. to a USB stick or a personal cloud-synced folder).
 *   3. On a new lab session/machine: before calling engine.init(), call
 *      importModelCache(file) to pre-populate Cache Storage from the
 *      snapshot. init() then finds everything already cached and skips
 *      the network fetch entirely.
 *
 * File format: a tiny custom container — a 4-byte big-endian header length,
 * a JSON manifest (url/status/headers/byteLength per entry), then the raw
 * response bodies concatenated in manifest order. No external dependencies.
 */
interface ModelCacheManifestEntry {
    url: string;
    status: number;
    statusText: string;
    headers: [string, string][];
    byteLength: number;
}
interface ModelCacheManifest {
    cacheName: string;
    createdAt: string;
    entries: ModelCacheManifestEntry[];
}
/**
 * Snapshots every entry currently stored in the given Cache Storage bucket
 * (default: transformers.js's default cache, "transformers-cache") into a
 * single Blob you can save to disk.
 */
declare function exportModelCache(cacheName?: string): Promise<Blob>;
/**
 * Triggers a browser download of a cache snapshot produced by
 * exportModelCache(). Convenience wrapper around an <a download> click.
 */
declare function downloadModelCache(blob: Blob, filename?: string): void;
/**
 * Re-hydrates Cache Storage from a snapshot file produced by
 * exportModelCache(). Call this BEFORE engine.init() so the local pipeline
 * finds the model already cached and skips the network entirely.
 *
 * By default entries are restored into the cache name recorded in the
 * snapshot's own manifest, so this works even if you rename the file.
 */
declare function importModelCache(file: Blob, options?: {
    cacheName?: string;
    onProgress?: (done: number, total: number) => void;
}): Promise<{
    cacheName: string;
    entriesRestored: number;
}>;
/**
 * Convenience helper for wiring up a plain <input type="file"> element:
 * pass the selected File straight through to importModelCache().
 */
declare function importModelCacheFromInput(input: HTMLInputElement, options?: Parameters<typeof importModelCache>[1]): Promise<{
    cacheName: string;
    entriesRestored: number;
}>;
/** Reports total bytes currently stored under a given cache name, if any. */
declare function getModelCacheSize(cacheName?: string): Promise<number>;
/** Deletes a cache bucket entirely (e.g. to force a clean re-download). */
declare function clearModelCache(cacheName?: string): Promise<boolean>;

export { type ModelCacheManifest, type ModelCacheManifestEntry, clearModelCache, downloadModelCache, exportModelCache, getModelCacheSize, importModelCache, importModelCacheFromInput };
