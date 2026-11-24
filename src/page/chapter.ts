import { currentGroup, type Group } from "./current-group";
import { chapterAudio, downloadChapterVideo, playChapter } from "./audio";

const reader = "https://ucontent.unipus.cn";
const chapter = "https://ipub.unipus.cn";
const request = "webtask:read-listening";
const response = "webtask:listening-result";

export function listenInChapter(win: Window) {
  if (
    win.location.origin !== chapter ||
    !/^\/learner\/textbook\/book\/[^/]+\/chapter\/[^/]+/.test(
      win.location.pathname,
    )
  )
    return;
  win.addEventListener("message", async (event) => {
    if (
      event.origin !== reader ||
      event.source !== win.parent ||
      event.data?.type !== request ||
      typeof event.data.id !== "string"
    )
      return;
    const envelope = { type: response, id: event.data.id };
    try {
      if(event.data.audio === "play") {await playChapter(win.document,event.data.view);win.parent.postMessage({...envelope,ended:true},reader);return;}
      if(event.data.audio==="video"){win.parent.postMessage({...envelope,...await downloadChapterVideo(win.document,event.data.view)},reader);return;}
      if (event.data.audio === true) {
        const audio = await chapterAudio(win.document, event.data.view);
        win.parent.postMessage({ ...envelope, audio }, reader);
        return;
      }
      const group = await currentGroup(win.document, event.data.view);
      win.parent.postMessage({ ...envelope, group }, reader);
    } catch (error) {
      win.parent.postMessage(
        {
          ...envelope,
          error: error instanceof Error ? error.message : "题目读取失败。",
        },
        reader,
      );
    }
  });
}

export function readChapter(doc: Document): Promise<Group>;
export function readChapter(doc: Document, audio: true): Promise<Blob>;
export function readChapter(doc:Document,audio:"video"):Promise<Blob | undefined>;
export function readChapter(doc:Document,audio:"play"):Promise<void>;
export async function readChapter(
  doc: Document,
  audio: boolean | "video" | "play" = false,
): Promise<Group | Blob | void> {
  const win = doc.defaultView!;
  const visible = Array.from(doc.querySelectorAll("iframe")).filter(
    (frame) => frame.getClientRects().length,
  );
  const matching = visible.filter((frame) =>
    frame.src.startsWith(chapter + "/learner/textbook/book/"),
  );
  const frames = matching.length ? matching : visible;
  if (frames.length !== 1 || !frames[0].contentWindow)
    throw new Error("请先打开 Unit 1 Lifestyle 章节，等题目显示后再试。");
  const source = frames[0].contentWindow;
  const id = win.crypto.randomUUID();
  return new Promise((resolve, reject) => {
    function finish() {
      win.clearTimeout(timer);
      win.removeEventListener("message", receive);
    }
    function receive(event: MessageEvent) {
      const data = event.data;
      if (
        event.origin !== chapter ||
        event.source !== source ||
        data?.type !== response ||
        data.id !== id
      )
        return;
      finish();
      if (!frames[0].isConnected)
        return reject(new Error("章节已切换，请重新提取。"));
      if (typeof data.error === "string") return reject(new Error(data.error));
      if(audio==="video" && data.downloaded===true) return resolve();
      if(audio==="play" && data.ended) return resolve();
      if (audio) {
        if (data.audio instanceof Blob && data.audio.size > 0)
          return resolve(data.audio);
        return reject(new Error("未收到有效的教材音频。"));
      }
      const group = data.group;
      if (group?.kind === "blanks" && typeof group.passage === "string")
        return resolve(group);
      const rows = group?.questions;
      if (
        !["choices", "judgments", "speaking", "heard"].includes(group?.kind) ||
        (group.kind === "speaking" && !((rows?.length === 1 || rows?.length === group.total) && Number.isSafeInteger(group.page) && Number.isSafeInteger(group.total) && group.page >= 1 && group.page <= group.total)) ||
        !Array.isArray(rows) ||
        !rows.length ||
        !rows.every(
          (q) =>
            typeof q?.stem === "string" &&
            Array.isArray(q.options) &&
            (group.kind === "judgments"
              ? q.options.join(",") === "T,F"
              : group.kind === "heard" ? q.options.length >= 2 && q.options.length <= 26
              : q.options.length === (group.kind === "speaking" ? 0 : 4)) &&
            q.options.every((v: unknown) => typeof v === "string"),
        )
      )
        return reject(new Error("教材返回的题目不完整。"));
      resolve(group);
    }
    const timer = win.setTimeout(
      () => {
        finish();
        reject(new Error("教材内页未响应，请确认油猴已更新并刷新整个教材页。"));
      },
      audio ? 700000 : 4000,
    );
    win.addEventListener("message", receive);
    const frame = frames[0];
    const origin = frame.getBoundingClientRect().top + frame.clientTop;
    let top = Math.max(0, -origin);
    let bottom = Math.min(frame.clientHeight, win.innerHeight - origin);
    for (let parent = frame.parentElement; parent; parent = parent.parentElement) {
      if (!/auto|scroll|hidden|clip/.test(win.getComputedStyle(parent).overflowY)) continue;
      const edge = parent.getBoundingClientRect().top + parent.clientTop - origin;
      top = Math.max(top, edge);
      bottom = Math.min(bottom, edge + parent.clientHeight);
    }
    source.postMessage({ type: request, id, audio, view: bottom > top ? {top, bottom} : undefined }, chapter);
  });
}
