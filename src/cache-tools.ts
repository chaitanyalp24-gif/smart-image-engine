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

export interface ModelCacheManifestEntry {
  url: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  byteLength: number;
}

export interface ModelCacheManifest {
  cacheName: string;
  createdAt: string;
  entries: ModelCacheManifestEntry[];
}

const DEFAULT_CACHE_NAME = "transformers-cache";

function assertCacheApiAvailable(): void {
  if (typeof caches === "undefined") {
    throw new Error(
      "Cache Storage API is not available in this environment. " +
        "cache-tools only works in a browser (or another environment exposing `caches`)."
    );
  }
}

/**
 * Snapshots every entry currently stored in the given Cache Storage bucket
 * (default: transformers.js's default cache, "transformers-cache") into a
 * single Blob you can save to disk.
 */
export async function exportModelCache(
  cacheName: string = DEFAULT_CACHE_NAME
): Promise<Blob> {
  assertCacheApiAvailable();

  const cache = await caches.open(cacheName);
  const requests = await cache.keys();

  if (requests.length === 0) {
    throw new Error(
      `Cache "${cacheName}" is empty — nothing to export. Run engine.init() ` +
        `(with WebGPU active) at least once first so the model actually downloads.`
    );
  }

  const manifestEntries: ModelCacheManifestEntry[] = [];
  const bodyChunks: ArrayBuffer[] = [];

  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;

    const buffer = await response.clone().arrayBuffer();
    manifestEntries.push({
      url: request.url,
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      byteLength: buffer.byteLength,
    });
    bodyChunks.push(buffer);
  }

  const manifest: ModelCacheManifest = {
    cacheName,
    createdAt: new Date().toISOString(),
    entries: manifestEntries,
  };

  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const headerLenBuf = new ArrayBuffer(4);
  new DataView(headerLenBuf).setUint32(0, manifestBytes.byteLength, false);

  return new Blob([headerLenBuf, manifestBytes, ...bodyChunks], {
    type: "application/octet-stream",
  });
}

/**
 * Triggers a browser download of a cache snapshot produced by
 * exportModelCache(). Convenience wrapper around an <a download> click.
 */
export function downloadModelCache(
  blob: Blob,
  filename: string = "sd-turbo-cache.bin"
): void {
  if (typeof document === "undefined") {
    throw new Error("downloadModelCache() requires a DOM (browser) environment.");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Re-hydrates Cache Storage from a snapshot file produced by
 * exportModelCache(). Call this BEFORE engine.init() so the local pipeline
 * finds the model already cached and skips the network entirely.
 *
 * By default entries are restored into the cache name recorded in the
 * snapshot's own manifest, so this works even if you rename the file.
 */
export async function importModelCache(
  file: Blob,
  options: {
    cacheName?: string;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<{ cacheName: string; entriesRestored: number }> {
  assertCacheApiAvailable();

  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const headerLen = view.getUint32(0, false);
  const headerBytes = new Uint8Array(buffer, 4, headerLen);
  const manifest: ModelCacheManifest = JSON.parse(
    new TextDecoder().decode(headerBytes)
  );

  const targetCacheName = options.cacheName ?? manifest.cacheName;
  const cache = await caches.open(targetCacheName);

  let offset = 4 + headerLen;
  const total = manifest.entries.length;

  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i];
    const body = buffer.slice(offset, offset + entry.byteLength);
    offset += entry.byteLength;

    const response = new Response(body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers,
    });

    await cache.put(entry.url, response);
    options.onProgress?.(i + 1, total);
  }

  return { cacheName: targetCacheName, entriesRestored: total };
}

/**
 * Convenience helper for wiring up a plain <input type="file"> element:
 * pass the selected File straight through to importModelCache().
 */
export async function importModelCacheFromInput(
  input: HTMLInputElement,
  options?: Parameters<typeof importModelCache>[1]
): Promise<{ cacheName: string; entriesRestored: number }> {
  const file = input.files?.[0];
  if (!file) {
    throw new Error("No file selected.");
  }
  return importModelCache(file, options);
}

/** Reports total bytes currently stored under a given cache name, if any. */
export async function getModelCacheSize(
  cacheName: string = DEFAULT_CACHE_NAME
): Promise<number> {
  assertCacheApiAvailable();
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();

  let total = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const buffer = await response.clone().arrayBuffer();
    total += buffer.byteLength;
  }
  return total;
}

/** Deletes a cache bucket entirely (e.g. to force a clean re-download). */
export async function clearModelCache(
  cacheName: string = DEFAULT_CACHE_NAME
): Promise<boolean> {
  assertCacheApiAvailable();
  return caches.delete(cacheName);
}
