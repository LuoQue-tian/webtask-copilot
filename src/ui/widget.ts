declare function GM_getValue<T>(key: string, fallback: T): T;
declare function GM_setValue(key: string, value: unknown): void;
import { currentGroup, groupSize } from "../page/current-group";
import styles from "./widget.css?inline";
import { readChapter } from "../page/chapter";
import { transcribe } from "./speech";
import { recordTabSound } from "./tab-sound";
import { tutorPanel } from "./tutor";
import { enablePanelLayout } from "./panel-layout";
import { detectPage, type PageType } from "../page/page-detector";
import { watchPage } from "../page/watch-page";

const pageLabels: Record<PageType, string> = {
  course_reader: "教材学习页",
  course_list: "课程列表",
  assignment_list: "作业列表",
  assignment_detail: "作业详情",
  unknown: "未知页面",
};

const hostId = "webtask-copilot-widget";
declare const __WEBTASK_VERSION__: string;

export function mountWidget(doc: Document): void {
  if (!doc.body || doc.getElementById(hostId)) return;

  const localLayout =
    doc.location.protocol === "file:" &&
    doc.body.hasAttribute("data-webtask-layout-preview");
  const host = doc.createElement("div");
  host.id = hostId;
  const root = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = styles;

  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.className = "launcher";
  toggle.textContent = "WebTask 助手";
  toggle.setAttribute("aria-controls", "panel");
  toggle.setAttribute("aria-expanded", "false");

  const panel = doc.createElement("section");
  panel.id = "panel";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "panel-title");

  const title = doc.createElement("h2");
  title.id = "panel-title";
  title.textContent = "WebTask 助手";
  const version = doc.createElement("small");
  version.className = "running-version";
  version.textContent = "v" + __WEBTASK_VERSION__;
  version.title = "此标签页正在运行的助手版本";
  title.append(" ", version);
  const fitPanel = enablePanelLayout(panel, title);
  const status = doc.createElement("dl");
  status.setAttribute("aria-live", "polite");
  const [platform, page, recognition] = [
    "当前平台",
    "页面类型",
    "识别状态",
  ].map((label) => {
    const term = doc.createElement("dt");
    term.textContent = label;
    const value = doc.createElement("dd");
    status.append(term, value);
    return value;
  });
  const close = doc.createElement("button");
  close.type = "button";
  close.textContent = "收起面板";

  function setOpen(open: boolean): void {
    panel.hidden = !open;
    if (typeof GM_setValue === "function")
      GM_setValue("webtask-panel-open", open);
    if (open) fitPanel();
    toggle.setAttribute("aria-expanded", String(open));
    (open ? close : toggle).focus();
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));
  root.addEventListener("keydown", (event) => {
    if (
      event instanceof KeyboardEvent &&
      event.key === "Escape" &&
      !panel.hidden
    ) {
      event.stopPropagation();
      if (activePane !== "学习对话") navigate("学习对话");
      else setOpen(false);
    }
  });

  panel.append(title, status, close);
  const refreshButton = doc.createElement("button");
  refreshButton.type = "button";
  refreshButton.textContent = "刷新助手";
  refreshButton.title = "重新识别页面并读取当前题组";
  const extract = doc.createElement("button");
  extract.type = "button";
  extract.textContent = "提取本组";
  const message = doc.createElement("p");
  message.setAttribute("role", "status");
  const list = doc.createElement("ol");
  const passage = doc.createElement("p");
  async function loadGroup(manualRefresh: boolean) {
    if (extract.disabled) return;
    extract.disabled = refreshButton.disabled = true;
    message.textContent = "正在读取教材…";
    try {
      const group = localLayout
        ? await currentGroup(doc)
        : await readChapter(doc);
      const signature = JSON.stringify(group);
      if (manualRefresh && extractedGroup === signature) {
        message.textContent = "助手已刷新 · 当前题组没有变化。";
        return;
      }
      extractedGroup = signature;
      list.replaceChildren();
      passage.replaceChildren();
      tutor.setGroup(group);
      if (group.kind === "blanks") {
        passage.textContent = group.passage;
        message.textContent = `${group.choicesByBlank ? "摘要选词填空" : "听力原词填空"} · ${groupSize(group)} 个空`;
        for (const options of group.choicesByBlank ?? []) {
          const row = doc.createElement("li");
          row.textContent = options.length
            ? options.join(" / ")
            : "选项尚未读到";
          list.append(row);
        }
        return;
      }
      for (const question of group.questions) {
        const row = doc.createElement("li");
        if (group.kind === "speaking" && group.questions.length === 1)
          row.value = group.page;
        row.textContent = question.stem;
        const choices = doc.createElement("ol");
        choices.type = "A";
        if (group.kind === "judgments") choices.style.listStyle = "none";
        for (const option of question.options) {
          const item = doc.createElement("li");
          item.textContent = option;
          choices.append(item);
        }
        row.append(choices);
        list.append(row);
      }
      message.textContent =
        group.kind === "speaking"
          ? `已提取${group.label}。已收集 ${group.collected}/${group.total} 题。` +
            (group.collected === group.total
              ? "可选择整组题目。"
              : "翻页后点击「提取本组」继续收集。")
          : `已提取 ${group.questions.length} 道${group.label ?? (group.kind === "judgments" ? "听力判断" : "听力单选")}题`;
    } catch (error) {
      if (!manualRefresh) {
        extractedGroup = "";
        tutor.setGroup();
        passage.replaceChildren();
        list.replaceChildren();
      }
      message.textContent =
        (error instanceof Error
          ? error.message
          : "提取失败，请重新打开章节。") +
        (manualRefresh && extractedGroup ? "（仍显示上次提取结果）" : "");
    } finally {
      extract.disabled = refreshButton.disabled = false;
    }
  }
  extract.onclick = () => loadGroup(false);
  const audioTools = doc.createElement("div");
  const speech = doc.createElement("button");
  speech.textContent = "转写英文原文";
  const save = doc.createElement("button");
  save.textContent = "保存音频";
  const video = doc.createElement("button");
  video.textContent = "下载视频";
  const audioStatus = doc.createElement("p");
  audioStatus.setAttribute("role", "status");
  const transcript = doc.createElement("div");
  transcript.style.whiteSpace = "pre-line";
  let extractedGroup = "",
    transcribedGroup = "";
  const tutor = tutorPanel(
    doc,
    () =>
      extractedGroup && extractedGroup === transcribedGroup
        ? (transcript.textContent ?? "")
        : "",
    () => transcript.textContent ?? "",
  );
  let pendingShare: {group:string; download:boolean} | undefined;
  async function runAudio(download: boolean, originalVideo = false) {
    video.disabled = speech.disabled = save.disabled = true;
    audioStatus.textContent = "正在读取教材媒体；若需要按播放提取，播完会自动结束。";
    let haveAudio = false;
    try {
      const groupRequest = download
        ? ""
        : readChapter(doc).then(
            (g) => JSON.stringify(g),
            () => "",
          );
      const share = async () => {
        let playbackError: unknown;
        audioStatus.textContent = "请选择教材标签页并勾选共享音频，视频会自动从头播放。";
        const blob = await recordTabSound(stop => {
          audioStatus.textContent = "正在提取播放声音，播完后自动处理。";
          void readChapter(doc,"play").catch(error => {playbackError=error;}).finally(stop);
        });
        if (playbackError) throw playbackError;
        return blob;
      };
      const retryShare = !originalVideo && pendingShare?.group === extractedGroup && pendingShare.download === download;
      pendingShare = undefined;
      let blob: Blob;
      if(retryShare) blob = await share();
      else {
        try {
          const media = originalVideo ? await readChapter(doc,"video") : await readChapter(doc,true);
          if(!media){audioStatus.textContent="教材视频已下载，可在 Edge 下载列表查看。";return;}
          blob=media;
        }
        catch(error) {
          if(originalVideo || !String(error).includes("共享教材标签页") || typeof navigator.mediaDevices?.getDisplayMedia !== "function") throw error;
          if (!navigator.userActivation?.isActive) {
            pendingShare={group:extractedGroup,download};
            throw new Error("Edge 需要你再次点击同一个按钮以授权共享教材标签页声音。");
          }
          blob=await share();
        }
      }
      haveAudio=true;
      const sourceGroup = await groupRequest;
      if (download) {
        const extension: Record<string, string> = {
          "video/mp4":"mp4", "video/webm":"webm","video/ogg":"ogv","video/quicktime":"mov",
          "audio/mpeg": "mp3",
          "audio/mp3": "mp3",
          "audio/wav": "wav",
          "audio/x-wav": "wav",
          "audio/ogg": "ogg",
          "audio/mp4": "m4a",
          "audio/webm": "webm",
        };
        const link = doc.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download =
          (originalVideo ? "教材视频." : "教材听力.") + (extension[blob.type.split(";")[0]] ?? (originalVideo ? "video" : "audio"));
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);
        audioStatus.textContent = "已请求下载，可在 Edge 下载列表查看。";
      } else {
        audioStatus.textContent = "本机正在识别英文语音…";
        transcript.textContent = await transcribe(blob);
        transcribedGroup = sourceGroup;
        audioStatus.textContent = "英文转写完成 · 时间为每段开始位置";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "音频处理失败。";
      audioStatus.textContent = haveAudio && !download ? "音频已提取，英文转写失败。" + message : message;
    } finally {
      video.disabled = speech.disabled = save.disabled = false;
    }
  }
  speech.onclick = () => runAudio(false);
  save.onclick = () => runAudio(true);
  video.onclick = () => runAudio(true,true);
  audioTools.append(speech, save, video, audioStatus, transcript);
  const sessions = tutor.sessions;
  const main = doc.createElement("main");
  const rail = doc.createElement("nav");
  rail.setAttribute("aria-label", "助手导航");
  const views = new Map<string, HTMLElement>();
  const links = new Map<string, HTMLButtonElement>();
  let activePane = "学习对话";
  function view(name: string) {
    const el = doc.createElement("article");
    el.className = "workspace-view";
    el.setAttribute("aria-label", name);
    el.hidden = true;
    views.set(name, el);
    main.append(el);
    return el;
  }
  function action(label: string, fn: () => void) {
    const button = doc.createElement("button");
    button.textContent = label;
    button.onclick = fn;
    return button;
  }
  function navigate(name: string) {
    activePane = name;
    for (const [key, el] of views) el.hidden = key !== name;
    for (const [key, link] of links)
      link.setAttribute("aria-pressed", String(key === name));
    heading.textContent = name;
    if (name === "会话") sessions.render();
    updateLibrary();
    main
      .querySelector<HTMLElement>("article:not([hidden])")
      ?.focus({ preventScroll: true });
  }
  const bar = doc.createElement("header");
  close.className = "collapse";
  close.title = "收起面板";
  close.setAttribute("aria-label", "收起面板");
  close.textContent = "−";
  bar.append(title, close);
  const heading = doc.createElement("h3");
  const back = action("返回对话", () => navigate("学习对话"));
  const subhead = doc.createElement("div");
  subhead.className = "subhead";
  subhead.append(heading, back);
  main.prepend(subhead);
  const chat = view("学习对话"),
    questions = view("题目"),
    notes = view("笔记"),
    history = view("会话"),
    settings = view("设置"),
    actions = view("功能");
  for (const el of views.values()) el.tabIndex = -1;
  const start = action("开始会话", () => sessions.create.click());
  start.className = "primary";
  const welcome = doc.createElement("div");
  welcome.className = "welcome";
  const emblem = doc.createElement("span");
  emblem.className = "emblem";
  emblem.textContent = "W";
  const intro = doc.createElement("h4");
  intro.textContent = "开始一段学习对话";
  const hint = doc.createElement("p");
  hint.textContent = "把题目和转写加入会话，随时回看解析、继续追问。";
  welcome.append(emblem, intro, hint, start);
  const answer = doc.createElement("div");
  answer.className = "answer";
  answer.hidden = true;
  const composer = doc.createElement("footer");
  sessions.question.placeholder = "输入你的问题…";
  const contextLine = doc.createElement("p");
  contextLine.className = "context-line";
  const reference = action("引用题目", () => navigate("题目"));
  reference.title = "选择题组并加入当前会话";
  const sendRow = doc.createElement("div");
  sendRow.className = "send-row";
  sessions.submit.className = "primary";
  sendRow.append(reference, sessions.purpose, sessions.submit);
  composer.append(
    contextLine,
    sessions.question,
    sendRow,
    sessions.material,
    sessions.notice,
  );
  const feed = doc.createElement("div");
  feed.className = "feed";
  feed.append(welcome, sessions.log, answer);
  chat.append(feed, composer);
  tutor.box.open = true;
  sessions.box.remove();
  const tools = doc.createElement("div");
  tools.className = "toolbar";
  tools.append(extract, refreshButton, sessions.add);
  extract.className = "primary";
  const media = doc.createElement("details");
  const mediaTitle = doc.createElement("summary");
  mediaTitle.textContent = "音频与转写";
  media.append(
    mediaTitle,
    audioTools,
    tutor.audioBox,
    sessions.audio,
    sessions.reuse,
  );
  questions.append(tools, message, passage, list, media, tutor.box);
  const noteText = doc.createElement("div");
  noteText.className = "note-body";
  notes.append(noteText, sessions.download);
  history.append(sessions.picker, sessions.create, sessions.status);
  function caption(label: string) {
    const el = doc.createElement("h4");
    el.textContent = label;
    return el;
  }
  settings.append(
    caption("助手版本"),
    version,
    status,
    caption("DeepSeek 连接"),
    tutor.connection,
    tutor.configure,
    tutor.connect,
    caption("文本模型"),
    tutor.model,
    caption("服务地址"),
    "https://api.deepseek.com",
    caption("英文转写"),
    "本机服务 · 127.0.0.1:4180",
  );
  actions.append(
    action("提取题目", () => navigate("题目")),
    action("整理知识点", () => sessions.openNotes()),
    action("新建对话", () => sessions.create.click()),
  );
  for (const [name, icon] of [
    ["设置", "⚙"],
    ["题目", "▤"],
    ["笔记", "▧"],
    ["会话", "◷"],
    ["功能", "⊞"],
  ]) {
    const link = action(icon, () =>
      navigate(activePane === name ? "学习对话" : name),
    );
    link.setAttribute("aria-label", name);
    link.title = name;
    links.set(name, link);
    const label = doc.createElement("small");
    label.textContent = name;
    link.append(label);
    rail.append(link);
  }
  const layout = doc.createElement("div");
  layout.className = "layout";
  layout.append(main, rail);
  panel.replaceChildren(bar, layout);
  function updateLibrary() {
    const session = sessions.current();
    back.hidden = activePane === "学习对话";
    heading.textContent =
      activePane === "学习对话" ? session?.name || "学习对话" : activePane;
    welcome.hidden = !!session || !answer.hidden;
    composer.hidden = !session;
    const groups = session?.groups || [];
    contextLine.textContent = groups.length
      ? `已引用 ${groups.length} 组题目 · ${groups.some((g) => g.transcript || g.audio) ? "含音频材料" : "仅题面"}`
      : "当前会话尚未引用题目";
    noteText.textContent =
      session?.notes || "当前会话还没有知识笔记。可在「功能」中整理知识点。";
    sessions.download.disabled = !session?.notes;
  }
  let sessionId = sessions.id();
  sessions.box.addEventListener("librarychange", () => {
    const next = sessions.id();
    if (next !== sessionId) {
      sessionId = next;
      answer.hidden = true;
      sessions.question.value = "";
      navigate("学习对话");
    } else updateLibrary();
  });
  sessions.box.addEventListener("requestchat", () => {
    navigate("学习对话");
    sessions.question.focus();
  });
  tutor.box.addEventListener("analysisdone", () => {
    if (
      !sessions.current()?.turns.at(-1)?.reply ||
      sessions.current()?.turns.at(-1)?.reply !== tutor.result.textContent
    ) {
      answer.textContent = tutor.result.textContent;
      answer.hidden = false;
    }
    navigate("学习对话");
  });
  sessions.refreshWindow();
  navigate("学习对话");
  root.append(style, panel, toggle);
  doc.body.append(host);
  const win = doc.defaultView!;
  const refresh = () => {
    if (!host.isConnected && doc.body) doc.body.append(host);
    const context = detectPage(doc);
    extract.hidden =
      !localLayout &&
      (context.platformId !== "ucampus" ||
        context.pageType !== "course_reader");
    audioTools.hidden = extract.hidden;
    tutor.box.hidden = extract.hidden;
    refreshButton.disabled = extract.hidden;
    platform.textContent =
      context.platformId === "ucampus"
        ? "U 校园"
        : context.platformId === "local-preview"
          ? "本地验收平台"
          : "未知平台";
    page.textContent = pageLabels[context.pageType];
    recognition.textContent =
      context.pageType === "unknown" ? "未匹配" : "已识别";
  };
  let stop = watchPage(doc, refresh);
  refreshButton.onclick = () => {
    refresh();
    if (!extract.hidden) void loadGroup(true);
    else message.textContent = "助手已刷新 · 已重新识别当前页面。";
  };
  win.addEventListener("pagehide", () => stop());
  win.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      stop();
      stop = watchPage(doc, refresh);
    }
  });
}
