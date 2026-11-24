export type PageType =
  | "course_reader"
  | "course_list"
  | "assignment_list"
  | "assignment_detail"
  | "unknown";

const routes = new Map<string, PageType>([
  ["", "course_list"],
  ["#courses", "course_list"],
  ["#self-test", "course_list"],
  ["#assignments", "assignment_list"],
  ["#detail", "assignment_detail"],
]);

export function detectPage(doc: Document) {
  const url = new URL(doc.URL);
  const isCourseReader =
    url.origin === "https://ucontent.unipus.cn" &&
    url.pathname === "/_ipublishpc_default/pc.html";
  const platformId = isCourseReader
    ? "ucampus"
    : url.protocol === "http:" &&
        url.hostname === "127.0.0.1" &&
        url.pathname === "/webtask-copilot/"
      ? "local-preview"
      : null;
  const candidate = routes.get(url.hash);
  const marker =
    candidate &&
    platformId === "local-preview" &&
    doc
      .querySelector("main [data-preview-page]")
      ?.getAttribute("data-preview-page");
  const pageType: PageType = isCourseReader
    ? "course_reader"
    : platformId && candidate && candidate === marker
      ? candidate
      : "unknown";
  return {
    url: url.href,
    hostname: url.hostname,
    title: doc.title,
    platformId,
    pageType,
    detectedAt: new Date().toISOString(),
  };
}
