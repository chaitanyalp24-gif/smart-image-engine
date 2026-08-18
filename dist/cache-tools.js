// src/cache-tools.ts
var DEFAULT_CACHE_NAME = "transformers-cache";
function assertCacheApiAvailable() {
  if (typeof caches === "undefined") {
    throw new Error(
      "Cache Storage API is not available in this environment. cache-tools only works in a browser (or another environment exposing `caches`)."
    );
  }
}
async function exportModelCache(cacheName = DEFAULT_CACHE_NAME) {
  assertCacheApiAvailable();
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  if (requests.length === 0) {
    throw new Error(
      `Cache "${cacheName}" is empty \u2014 nothing to export. Run engine.init() (with WebGPU active) at least once first so the model actually downloads.`
    );
  }
  const manifestEntries = [];
  const bodyChunks = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const buffer = await response.clone().arrayBuffer();
    manifestEntries.push({
      url: request.url,
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      byteLength: buffer.byteLength
    });
    bodyChunks.push(buffer);
  }
  const manifest = {
    cacheName,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    entries: manifestEntries
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const headerLenBuf = new ArrayBuffer(4);
  new DataView(headerLenBuf).setUint32(0, manifestBytes.byteLength, false);
  return new Blob([headerLenBuf, manifestBytes, ...bodyChunks], {
    type: "application/octet-stream"
  });
}
function downloadModelCache(blob, filename = "sd-turbo-cache.bin") {
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
async function importModelCache(file, options = {}) {
  assertCacheApiAvailable();
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const headerLen = view.getUint32(0, false);
  const headerBytes = new Uint8Array(buffer, 4, headerLen);
  const manifest = JSON.parse(
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
      headers: entry.headers
    });
    await cache.put(entry.url, response);
    options.onProgress?.(i + 1, total);
  }
  return { cacheName: targetCacheName, entriesRestored: total };
}
async function importModelCacheFromInput(input, options) {
  const file = input.files?.[0];
  if (!file) {
    throw new Error("No file selected.");
  }
  return importModelCache(file, options);
}
async function getModelCacheSize(cacheName = DEFAULT_CACHE_NAME) {
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
async function clearModelCache(cacheName = DEFAULT_CACHE_NAME) {
  assertCacheApiAvailable();
  return caches.delete(cacheName);
}
export {
  clearModelCache,
  downloadModelCache,
  exportModelCache,
  getModelCacheSize,
  importModelCache,
  importModelCacheFromInput
};
//# sourceMappingURL=cache-tools.js.map