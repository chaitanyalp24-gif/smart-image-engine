// src/index.ts
var SmartImageEngine = class {
  constructor(options = {}) {
    this.backend = "uninitialized";
    this.localPipeline = null;
    this.initialized = false;
    this.localModelId = options.localModelId ?? "Xenova/sd-turbo";
    this.cloudBaseUrl = options.cloudBaseUrl ?? "https://image.pollinations.ai/prompt/";
    this.forceBackend = options.forceBackend;
    this.onProgress = options.onProgress;
  }
  /** Which backend is currently active. */
  get currentBackend() {
    return this.backend;
  }
  /** Whether init() has completed. */
  get isInitialized() {
    return this.initialized;
  }
  /**
   * Detects WebGPU support and prepares the appropriate backend.
   * Must be called (and awaited) before generate().
   */
  async init() {
    const useWebGPU = this.forceBackend === "webgpu" ? true : this.forceBackend === "cloud" ? false : await this.detectWebGPU();
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
  async generate(prompt, options = {}) {
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
  async detectWebGPU() {
    if (typeof navigator === "undefined") return false;
    const nav = navigator;
    if (!nav.gpu) return false;
    try {
      const adapter = await nav.gpu.requestAdapter();
      return adapter !== null && adapter !== void 0;
    } catch {
      return false;
    }
  }
  async initLocalPipeline() {
    this.onProgress?.(`Loading local model "${this.localModelId}"\u2026`, 0);
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    this.localPipeline = await pipeline(
      "text-to-image",
      this.localModelId,
      {
        device: "webgpu",
        dtype: "fp16",
        progress_callback: (p) => {
          this.onProgress?.(p.status ?? "loading", p.progress);
        }
      }
    );
    this.onProgress?.("Local WebGPU pipeline ready.", 100);
  }
  async generateLocal(prompt, options) {
    if (!this.localPipeline) {
      return this.generateCloud(prompt, options);
    }
    const output = await this.localPipeline(prompt, {
      num_inference_steps: options.numInferenceSteps ?? 1,
      guidance_scale: 0
      // sd-turbo is distilled for classifier-free-guidance-free, 1-step sampling
    });
    const url = this.extractDataUrl(output);
    return {
      url,
      backend: "webgpu",
      prompt,
      seed: options.seed
    };
  }
  /** Normalizes whatever shape transformers.js returns into a data: URL. */
  extractDataUrl(output) {
    if (output && typeof output === "object" && "toDataURL" in output && typeof output.toDataURL === "function") {
      return output.toDataURL();
    }
    if (output && typeof output === "object" && "toCanvas" in output && typeof output.toCanvas === "function") {
      const canvas = output.toCanvas();
      return canvas.toDataURL("image/png");
    }
    if (Array.isArray(output) && output.length > 0) {
      return this.extractDataUrl(output[0]);
    }
    throw new Error(
      "Unexpected output shape from the local text-to-image pipeline; unable to extract an image URL."
    );
  }
  generateCloud(prompt, options) {
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;
    const seed = options.seed ?? Math.floor(Math.random() * 1e9);
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `${this.cloudBaseUrl}${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    return {
      url,
      backend: "cloud",
      prompt,
      seed
    };
  }
};
var index_default = SmartImageEngine;
export {
  SmartImageEngine,
  index_default as default
};
//# sourceMappingURL=index.js.map