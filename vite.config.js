import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    https: false,
    sourcemapIgnoreList: () => true,
  },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
  build: {
    sourcemap: false,
  },
});
