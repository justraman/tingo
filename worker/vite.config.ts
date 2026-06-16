import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "../out/worker"),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, "index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      // The host runtime provides these as runtime imports.
      external: ["@parity/product-sdk-host", "@parity/product-sdk-chain-client", "polkadot-api"],
    },
    target: "es2022",
    minify: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
});
