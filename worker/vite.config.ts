import { defineConfig, loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "NEXT_PUBLIC_");
  return {
    // The worker sandbox has no `process`; bake NEXT_PUBLIC_* in at build
    // time, and collapse any unset one to `undefined` so defaults apply.
    define: {
      "process.env": "{}",
      ...Object.fromEntries(
        Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]),
      ),
    },
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
  };
});
