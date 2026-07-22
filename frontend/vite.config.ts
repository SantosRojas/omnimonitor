import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  /** Backend URL for the Vite dev proxy (from .env.development). */
  const apiTarget = env.VITE_API_TARGET || "http://localhost:9001";

  return {
    plugins: [tailwindcss(), react()],
    server: {
      port: 5173,
      proxy: {
        "/api": apiTarget,
        "/ws": {
          target: apiTarget.replace(/^http/, "ws"),
          ws: true,
        },
        "/health": apiTarget,
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/test-setup.ts",
    },
  };
});
