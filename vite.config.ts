import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "NEXT_PUBLIC_");
  return {
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    // The product sandbox has no `process`; bake NEXT_PUBLIC_* in at build
    // time, and collapse any unset one to `undefined` so defaults apply.
    define: {
      "process.env": "{}",
      ...Object.fromEntries(
        Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]),
      ),
    },
    build: {
      outDir: "out",
      target: "es2022",
    },
  };
});
