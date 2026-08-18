# smart-image-engine

A free, hybrid AI image generation library for the browser.

- **WebGPU available** → generates images 100% locally, offline, for free using
  `Xenova/sd-turbo` via [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) (transformers.js).
- **WebGPU unavailable** → transparently falls back to the free
  [Pollinations.ai](https://pollinations.ai) cloud image API — no API key needed.

Ships as both ESM and CJS with full TypeScript types (built with `tsup`).

## 1. Install

```bash
npm install
```

## 2. Build

```bash
npm run build
```

This runs `tsup` and outputs to `dist/`:

- `dist/index.js` — ESM build
- `dist/index.cjs` — CJS build
- `dist/index.d.ts` / `dist/index.d.cts` — type declarations for both

Run `npm run dev` for a watch build while developing.
Run `npm run typecheck` to type-check without emitting files.

## 3. Usage

```ts
import { SmartImageEngine } from "smart-image-engine";

const engine = new SmartImageEngine({
  onProgress: (status, progress) => console.log(status, progress),
});

// Must be called once, before generate(). Detects WebGPU and prepares
// whichever backend is available.
const backend = await engine.init(); // "webgpu" | "cloud"
console.log("Using backend:", backend);

const result = await engine.generate("a watercolor fox in a misty forest");

console.log(result.url);      // data: URL (local) or https: URL (cloud)
console.log(result.backend);  // "webgpu" | "cloud"

// Drop straight into an <img> tag
const img = document.createElement("img");
img.src = result.url;
document.body.appendChild(img);
```

### Options

```ts
new SmartImageEngine({
  localModelId: "Xenova/sd-turbo",                    // HF model id for local WebGPU generation
  cloudBaseUrl: "https://gen.pollinations.ai/image/",  // cloud fallback base URL
  forceBackend: "cloud",                               // optional: skip auto-detection
  onProgress: (status, progress) => {},                // optional: local model load progress
});
```

```ts
engine.generate(prompt, {
  width: 1024,             // cloud fallback only
  height: 1024,            // cloud fallback only
  seed: 42,                // both backends (cloud always returns the seed used)
  numInferenceSteps: 1,    // local WebGPU only — sd-turbo is a 1-step distilled model
});
```

## Persisting the model cache across ephemeral sessions

If you're developing on a machine with no persistent local storage (e.g. a
shared college lab PC that wipes the profile between sessions), the WebGPU
path re-downloads the entire `sd-turbo` model into the browser's Cache
Storage every session — that's the slow part, not `npm install`.

`smart-image-engine/cache-tools` solves this: export the cache to a single
portable file once, then re-import it on any future session/machine in
seconds instead of re-downloading.

```ts
import {
  exportModelCache,
  importModelCache,
  downloadModelCache,
} from "smart-image-engine/cache-tools";

// After engine.init() has run once with WebGPU active and the model has
// fully downloaded:
const blob = await exportModelCache();
downloadModelCache(blob, "sd-turbo-cache.bin");
// Save sd-turbo-cache.bin to a USB stick or a synced personal cloud folder.

// On a new session/machine, BEFORE calling engine.init():
const file = /* File from an <input type="file"> */;
await importModelCache(file);
// engine.init() now finds everything already cached — no network needed.
```

Also included: `getModelCacheSize()` and `clearModelCache()`. See
`demo/index.html` for a working example with export/import wired to
buttons — run `npm run build` first, then serve the repo root with any
static file server (ES module imports need `http://`, not `file://`) and
open `demo/index.html`.

### The other half: `npm install` churn

Smaller cost (fetching packages, not GBs of model weights), but if it's
still annoying: rename `.npmrc.example` to `.npmrc` and point `cache` at a
folder on persistent storage. npm will then reuse its package cache across
sessions instead of re-fetching `@huggingface/transformers` and everything
else from the registry every time.

## Notes

- `@huggingface/transformers` is imported dynamically inside `init()`, so it's
  never pulled into your bundle unless the WebGPU path is actually taken.
- If a WebGPU adapter exists but the local pipeline fails to load (driver
  quirk, model fetch failure, out-of-memory, etc.), the engine fails soft and
  falls back to the cloud backend automatically rather than throwing.
- This library assumes a browser-like environment (`navigator`, `document`
  for canvas decoding). It is not intended for server-side/Node rendering.
- Static, zero-backend friendly — the cloud fallback is a plain GET URL you
  can drop straight into an `<img src>`, no server-side proxy required, which
  makes it a good fit for static hosts like Cloudflare Pages.

## License

MPL-2.0
