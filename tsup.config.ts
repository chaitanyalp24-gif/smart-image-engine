import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cache-tools.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  target: "es2020",
  // @huggingface/transformers is large and browser/WebGPU-oriented;
  // consumers install it themselves, so we don't bundle it.
  external: ["@huggingface/transformers"],
});
