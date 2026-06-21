import { defineConfig } from "vite";
import { resolve } from "path";

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
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        runner: resolve(__dirname, "runner.html"),
        fruitninja: resolve(__dirname, "fruitninja.html"),
      },
    },
  },
});
