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
type SmartImageBackend = "webgpu" | "cloud" | "uninitialized";
/** Options for the generate() call. */
interface GenerateOptions {
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
interface GenerateResult {
    /** "data:image/..." URL for local generation, or an https:// URL for the cloud fallback. */
    url: string;
    /** Which backend actually produced this image. */
    backend: Exclude<SmartImageBackend, "uninitialized">;
    /** The prompt used to generate the image. */
    prompt: string;
    /** The seed used (if applicable/known). */
    seed?: number;
}
interface SmartImageEngineOptions {
    /** Hugging Face model id to use for local WebGPU generation. Default: "Xenova/sd-turbo" */
    localModelId?: string;
    /** Base URL for the cloud fallback provider. Default: Pollinations. */
    cloudBaseUrl?: string;
    /** Force a specific backend instead of auto-detecting. Mostly useful for testing. */
    forceBackend?: "webgpu" | "cloud";
    /** Called with human-readable progress while the local model downloads/loads. */
    onProgress?: (status: string, progress?: number) => void;
}
declare class SmartImageEngine {
    private backend;
    private localPipeline;
    private initialized;
    private readonly localModelId;
    private readonly cloudBaseUrl;
    private readonly forceBackend?;
    private readonly onProgress?;
    constructor(options?: SmartImageEngineOptions);
    /** Which backend is currently active. */
    get currentBackend(): SmartImageBackend;
    /** Whether init() has completed. */
    get isInitialized(): boolean;
    /**
     * Detects WebGPU support and prepares the appropriate backend.
     * Must be called (and awaited) before generate().
     */
    init(): Promise<SmartImageBackend>;
    /**
     * Generates an image for the given prompt using whichever backend was
     * selected during init(). Throws if init() hasn't been called yet.
     */
    generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
    private detectWebGPU;
    private initLocalPipeline;
    private generateLocal;
    /** Normalizes whatever shape transformers.js returns into a data: URL. */
    private extractDataUrl;
    private generateCloud;
}

export { type GenerateOptions, type GenerateResult, type SmartImageBackend, SmartImageEngine, type SmartImageEngineOptions, SmartImageEngine as default };
