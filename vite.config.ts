import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), tanstackStart({server: {entry: "server"}}), netlify(), tailwindcss(), viteReact()],
  define: {__SCANRADAR_PREVIEW__: JSON.stringify(["deploy-preview", "branch-deploy"].includes(process.env["CONTEXT"] || ""))},
  resolve: {dedupe: ["react", "react-dom", "@tanstack/react-router"]},
});
