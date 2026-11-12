import { defineConfig } from "vite";

export default defineConfig({
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
