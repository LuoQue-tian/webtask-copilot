import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { JSDOM } from "jsdom";
import { build } from "vite";
import { expect, it } from "vitest";
import { createPreviewServer } from "../../scripts/preview.mjs";

it("打包后的单文件带有油猴头；面板开关、键盘焦点和原页计数均可用", async () => {
  const result = await build({ logLevel: "silent", build: { write: false } });
  const [release] = (Array.isArray(result) ? result[0] : result).output;
  expect(release.fileName).toBe("webtask-copilot.user.js");
  const header = await readFile(
    new URL("../../userscript.meta.txt", import.meta.url),
    "utf8",
  );
  expect(release.code.startsWith(header.trimEnd())).toBe(true);
  expect(release.imports).toEqual([]);

  const html = await readFile(
    new URL("../../preview/index.html", import.meta.url),
    "utf8",
  );
  // 两段脚本均来自本项目：验收页本身的计数器以及刚构建的油猴入口。
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://127.0.0.1:4178/webtask-copilot/",
  });
  try {
    const { document, KeyboardEvent } = dom.window;
    expect(document.getElementById("webtask-copilot-widget")).toBeNull();
    const script = document.createElement("script");
    script.textContent = release.code;
    document.body.append(script);
    const root = document.getElementById("webtask-copilot-widget").shadowRoot;
    const launcher = root.querySelector(".launcher");
    const panel = root.querySelector("section");
    const close = panel.querySelector("button");
    expect(panel.hidden).toBe(true);
    launcher.click();
    expect(panel.hidden).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(root.activeElement).toBe(close);
    document.getElementById("count").click();
    expect(document.getElementById("value").value).toBe("1");
    close.click();
    expect(panel.hidden).toBe(true);
    expect(root.activeElement).toBe(launcher);
    launcher.click();
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(panel.hidden).toBe(true);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    const values = () =>
      [...root.querySelectorAll("dd")].map((node) => node.textContent);
    expect(values()).toEqual(["本地验收平台", "课程列表", "已识别"]);
    const go = async (hash, expected) => {
      document.querySelector('a[href="' + hash + '"]').click();
      await expect.poll(() => values()[1]).toBe(expected);
    };
    launcher.click();
    await go("#assignments", "作业列表");
    await go("#detail", "作业详情");
    await go("#other", "未知页面");
    expect(values()[2]).toBe("未匹配");
    dom.window.history.back();
    await expect.poll(() => values()[1]).toBe("作业详情");
    const marker = document.getElementById("sample");
    marker.removeAttribute("data-preview-page");
    await expect.poll(() => values()[1]).toBe("未知页面");
    marker.dataset.previewPage = "assignment_detail";
    await expect.poll(() => values()[1]).toBe("作业详情");
    dom.window.history.replaceState(null, "", "#other");
    await expect.poll(() => values()[1]).toBe("未知页面");
    dom.window.history.pushState(null, "", "#detail");
    await expect.poll(() => values()[1]).toBe("作业详情");
    document.body.append(script.cloneNode(true));
    expect(document.querySelectorAll("#webtask-copilot-widget")).toHaveLength(
      1,
    );
    expect(panel.hidden).toBe(false);
  } finally {
    dom.window.close();
  }
});

it("验收服务提供页面，拒绝访问其他项目文件", async () => {
  const server = createPreviewServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  try {
    const page = await fetch(origin + "/webtask-copilot/");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain(
      'href="/install/webtask-copilot.user.js"',
    );
    expect((await fetch(origin + "/package.json")).status).toBe(404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
