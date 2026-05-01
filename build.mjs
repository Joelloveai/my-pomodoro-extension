import { build } from "esbuild";

const entries = [
  "background.js",
  "popup.js",
  "options.js",
  "focus-analytics.js",
  "license.js",
  "pro-services.js",
  "workspace-sync.js",
  "dashboard.js",
  "diagnostics.js",
  "content.js",
  "offscreen.js"
];

await build({
  entryPoints: entries,
  bundle: false,
  minify: true,
  target: ["chrome120"],
  outdir: ".",
  allowOverwrite: true
});

console.log("Build complete");

