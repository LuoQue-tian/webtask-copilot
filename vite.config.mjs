import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const metadata = readFileSync(
  new URL("./userscript.meta.txt", import.meta.url),
  "utf8",
).trimEnd();

export default defineConfig({
  define: { __WEBTASK_VERSION__: JSON.stringify(metadata.match(/^\/\/\s*@version\s+(\S+)/m)[1]) },
  plugins: [
    {
      name: "userscript-metadata",
      apply: "build",
      generateBundle(_options, bundle) {
        const script = bundle["webtask-copilot.user.js"];
        if (script?.type !== "chunk") throw new Error("缺少油猴脚本入口产物");
        script.code = metadata + "\n" + script.code;
      },
    },
  ],
  build: {
    target: "es2022",
    minify: false,
    lib: {
      entry: "src/entry/userscript.ts",
      name: "WebTaskCopilot",
      formats: ["iife"],
      fileName: () => "webtask-copilot.user.js",
    },
  },
});
