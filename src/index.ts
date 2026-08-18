/**
 * smart-image-engine
 * -------------------
 * A free, hybrid AI image generation engine.
 *
 * - If the browser supports WebGPU, images are generated 100% locally and
 *   offline using the `Xenova/sd-turbo` model via @huggingface/transformers
 *   (transformers.js). No API key, no server, no cost.
 * - If WebGPU is not available, it transparently falls back to the free
 *   Pollinations.ai image generation API over HTTPS.
 *
 * Works as ESM or CJS. Designed to run in the browser (or any environment
 * exposing `navigator.gpu`, e.g. Electron / recent Node with WebGPU flags).
 */

/** Backend the engine ended up using after init(). */
export type SmartImageBackend = "webgpu" | "cloud" | "uninitialized";

/** Options for the generate() call. */
export interface GenerateOptions {
  /** Output image width. Only affects the cloud fallback. Default: 1024 */
  width?: number;
  /** Output image height. Only affects the cloud fallback. Default: 1024 */
  height?: number;
  /** Deterministic seed. Random if omitted. */
  seed?: number;
  /** Number of inference steps for the local WebGPU pipeline. Default: 1 (sd-turbo is a distilled 1-step model). */
  numInferenceSteps?: number;
}

/** Result returned from generate(). */
export interface GenerateResult {
  /** "data:image/..." URL for local generation, or an https:// URL for the cloud fallback. */
  url: string;
  /** Which backend actually produced this image. */
  backend: Exclude<SmartImageBackend, "uninitialized">;
  /** The prompt used to generate the image. */
  prompt: string;
  /** The seed used (if applicable/known). */
  seed?: number;
}

export interface SmartImageEngineOptions {
  /** Hugging Face model id to use for local WebGPU generation. Default: "Xenova/sd-turbo" */
  localModelId?: string;
  /** Base URL for the cloud fallback provider. Default: Pollinations. */
  cloudBaseUrl?: string;
  /** Force a specific backend instead of auto-detecting. Mostly useful for testing. */
  forceBackend?: "webgpu" | "cloud";
  /** Called with human-readable progress while the local model downloads/loads. */
  onProgress?: (status: string, progress?: number) => void;
}

// Minimal structural typing so we don't need @webgpu/types as a hard dependency.
interface NavigatorWithGPU {
  gpu?: {
    requestAdapter: () => Promise<unknown | null>;
  };
}

/** Lazily-typed handle to the transformers.js text-to-image pipeline. */
type TextToImagePipeline = (
  prompt: string,
  options?: Record<string, unknown>
) => Promise<{ toDataURL?: () => string; toBlob?: () => Promise<Blob> } | { data: unknown } | unknown>;

export class SmartImageEngine {
  private backend: SmartImageBackend = "uninitialized";
  private localPipeline: TextToImagePipeline | null = null;
  private initialized = false;

  private readonly localModelId: string;
  private readonly cloudBaseUrl: string;
  private readonly forceBackend?: "webgpu" | "cloud";
  private readonly onProgress?: (status: string, progress?: number) => void;

  constructor(options: SmartImageEngineOptions = {}) {
    this.localModelId = options.localModelId ?? "Xenova/sd-turbo";
    this.cloudBaseUrl =
      options.cloudBaseUrl ?? "https://image.pollinations.ai/prompt/";
    this.forceBackend = options.forceBackend;
    this.onProgress = options.onProgress;
  }

  /** Which backend is currently active. */
  get currentBackend(): SmartImageBackend {
    return this.backend;
  }

  /** Whether init() has completed. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Detects WebGPU support and prepares the appropriate backend.
   * Must be called (and awaited) before generate().
   */
  async init(): Promise<SmartImageBackend> {
    const useWebGPU =
      this.forceBackend === "webgpu"
        ? true
        : this.forceBackend === "cloud"
          ? false
          : await this.detectWebGPU();

    if (useWebGPU) {
      try {
        await this.initLocalPipeline();
        this.backend = "webgpu";
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Unsupported pipeline")) {
          this.onProgress?.(
            "Local WebGPU text-to-image pipeline is not supported by transformers.js in this browser environment. Using cloud fallback."
          );
        } else {
          this.onProgress?.(
            `WebGPU pipeline failed to initialize, falling back to cloud: ${msg}`
          );
        }
        this.backend = "cloud";
      }
    } else {
      this.backend = "cloud";
    }

    this.initialized = true;
    return this.backend;
  }

  /**
   * Generates an image for the given prompt using whichever backend was
   * selected during init(). Throws if init() hasn't been called yet.
   */
  async generate(
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    if (!this.initialized) {
      throw new Error(
        "SmartImageEngine.generate() called before init(). Call and await init() first."
      );
    }

    if (this.backend === "webgpu" && this.localPipeline) {
      return this.generateLocal(prompt, options);
    }

    return this.generateCloud(prompt, options);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async detectWebGPU(): Promise<boolean> {
    if (typeof navigator === "undefined") return false;
    const nav = navigator as unknown as NavigatorWithGPU;
    if (!nav.gpu) return false;

    try {
      const adapter = await nav.gpu.requestAdapter();
      return adapter !== null && adapter !== undefined;
    } catch {
      return false;
    }
  }

  private async initLocalPipeline(): Promise<void> {
    this.onProgress?.(`Loading local model "${this.localModelId}"…`, 0);

    // Dynamic import keeps @huggingface/transformers out of the CJS/ESM
    // entry graph for consumers who only ever use the cloud fallback
    // (e.g. SSR / Node builds without WebGPU).
    const { pipeline, env } = await import("@huggingface/transformers");

    // Ensure the library targets the browser cache / WebGPU execution
    // provider rather than trying to hit a local Python server.
    env.allowLocalModels = false;

    this.localPipeline = (await pipeline(
      "text-to-image" as never,
      this.localModelId,
      {
        device: "webgpu",
        dtype: "fp16",
        progress_callback: (p: { status?: string; progress?: number }) => {
          this.onProgress?.(p.status ?? "loading", p.progress);
        },
      } as never
    )) as unknown as TextToImagePipeline;

    this.onProgress?.("Local WebGPU pipeline ready.", 100);
  }

  private async generateLocal(
    prompt: string,
    options: GenerateOptions
  ): Promise<GenerateResult> {
    if (!this.localPipeline) {
      // Defensive fallback: if something wiped out the pipeline after init
      // (e.g. context loss), don't crash the caller — use the cloud path.
      return this.generateCloud(prompt, options);
    }

    const output = await this.localPipeline(prompt, {
      num_inference_steps: options.numInferenceSteps ?? 1,
      guidance_scale: 0, // sd-turbo is distilled for classifier-free-guidance-free, 1-step sampling
    });

    const url = this.extractDataUrl(output);

    return {
      url,
      backend: "webgpu",
      prompt,
      seed: options.seed,
    };
  }

  /** Normalizes whatever shape transformers.js returns into a data: URL. */
  private extractDataUrl(output: unknown): string {
    if (
      output &&
      typeof output === "object" &&
      "toDataURL" in output &&
      typeof (output as { toDataURL: () => string }).toDataURL === "function"
    ) {
      return (output as { toDataURL: () => string }).toDataURL();
    }

    // RawImage-like objects from transformers.js expose .toCanvas()
    if (
      output &&
      typeof output === "object" &&
      "toCanvas" in output &&
      typeof (output as { toCanvas: () => HTMLCanvasElement }).toCanvas ===
        "function"
    ) {
      const canvas = (
        output as { toCanvas: () => HTMLCanvasElement }
      ).toCanvas();
      return canvas.toDataURL("image/png");
    }

    // Some pipeline versions return an array of images.
    if (Array.isArray(output) && output.length > 0) {
      return this.extractDataUrl(output[0]);
    }

    throw new Error(
      "Unexpected output shape from the local text-to-image pipeline; unable to extract an image URL."
    );
  }

  private generateCloud(
    prompt: string,
    options: GenerateOptions
  ): GenerateResult {
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;
    const seed = options.seed ?? Math.floor(Math.random() * 1_000_000_000);
    const encodedPrompt = encodeURIComponent(prompt);

    const url = `${this.cloudBaseUrl}${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

    return {
      url,
      backend: "cloud",
      prompt,
      seed,
    };
  }
}

export default SmartImageEngine;
