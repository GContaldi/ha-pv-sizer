import { defineConfig } from "vite";

export default defineConfig({
  // Library mode leaves `process.env.NODE_ENV` (from echarts) in the bundle, and browsers have no `process`.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: {
      entry: "src/pv-sizer-panel.ts",
      formats: ["es"],
      fileName: () => "pv-sizer-panel.js",
    },
    outDir: "../custom_components/pv_sizer/frontend",
    emptyOutDir: true,
    minify: true,
    rolldownOptions: { output: { minify: true } },
  },
});
