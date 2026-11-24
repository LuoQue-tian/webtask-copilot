import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const previewOrigin = "http://127.0.0.1:4178";
const files = new Map([
  [
    "/webtask-copilot/",
    [
      new URL("../preview/index.html", import.meta.url),
      "text/html; charset=utf-8",
    ],
  ],
  [
    "/install/webtask-copilot.user.js",
    [
      new URL("../dist/webtask-copilot.user.js", import.meta.url),
      "application/javascript; charset=utf-8",
    ],
  ],
]);

export function createPreviewServer() {
  return createServer(async (req, res) => {
    const file = files.get(req.url);
    if (req.method !== "GET" || !file) {
      res.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(file[0]);
      res.writeHead(200, {
        "Content-Type": file[1],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(bytes);
    } catch {
      res
        .writeHead(503, { "Content-Type": "text/plain; charset=utf-8" })
        .end("缺少验收文件，请先运行 npm run build。");
    }
  });
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const server = createPreviewServer();
  server.on("error", (error) => {
    console.error("本地验收页启动失败", error.message);
    process.exitCode = 1;
  });
  server.listen(4178, "127.0.0.1", () =>
    console.log(previewOrigin + "/webtask-copilot/"),
  );
}
