import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { detectPage } from "../../src/page/page-detector";

const local = "http://127.0.0.1:4178/webtask-copilot/";
it.each([
  [
    "https://ucontent.unipus.cn/_ipublishpc_default/pc.html?example=1#section",
    "",
    "ucampus",
    "course_reader",
  ],
  ["https://ucontent.unipus.cn/", "", null, "unknown"],
  [local, "course_list", "local-preview", "course_list"],
  [
    local + "#assignments",
    "assignment_list",
    "local-preview",
    "assignment_list",
  ],
  [
    local + "#detail",
    "assignment_detail",
    "local-preview",
    "assignment_detail",
  ],
  [local + "#other", "course_list", "local-preview", "unknown"],
  [local + "#detail", "", "local-preview", "unknown"],
  [local + "#detail", "course_list", "local-preview", "unknown"],
  [
    "https://example.org/webtask-copilot/#detail",
    "assignment_detail",
    null,
    "unknown",
  ],
  [local + "extra", "course_list", null, "unknown"],
])("识别 %s 和页面标记 %s", (url, marker, platformId, pageType) => {
  const dom = new JSDOM("<title>示例</title><main><p></p></main>", {
    url,
  });
  try {
    const doc = dom.window.document;
    if (marker) doc.querySelector("p").dataset.previewPage = marker;
    expect(detectPage(doc)).toMatchObject({
      url,
      title: "示例",
      platformId,
      pageType,
    });
  } finally {
    dom.window.close();
  }
});
