import type { Group } from "../page/current-group";
import type { StudyInput } from "../ai/deepseek";

declare function GM_getValue<T>(key: string, fallback: T): T;
declare function GM_setValue<T>(key: string, value: T): void;
type Recording = { id: string; name: string; text: string };
type SavedGroup = { content: Group; audio?: string; transcript?: string };
type Turn = { question: string; reply: string };
type Session = {
  id: string;
  name: string;
  groups: SavedGroup[];
  recordings: Recording[];
  turns: Turn[];
  notes?: string;
};
type Library = { active: string; sessions: Session[] };
const store = "webtask-study-sessions-v1";
const load = (): Library =>
  typeof GM_getValue === "function"
    ? GM_getValue(store, { active: "", sessions: [] })
    : { active: "", sessions: [] };
const same = (a: Group, b: Group) => JSON.stringify(a) === JSON.stringify(b);
const label = (g: Group) =>
  g.kind === "blanks" && g.choicesByBlank
    ? "摘要选词填空"
    : g.kind !== "blanks" && g.label
      ? g.label
      : g.kind === "judgments"
        ? "Task 1 判断"
        : g.kind === "choices"
          ? "Task 2 单选"
          : "Task 3 填空";

export function sessionControls(
  doc: Document,
  group: () => Group | undefined,
  transcript: () => string,
  study: (input: StudyInput) => Promise<string>,
  invalidate: () => void,
) {
  let tabId: string | undefined;
  const active = (db: Library) =>
    db.sessions.find((s) => s.id === (tabId ??= db.active));
  const box = doc.createElement("details");
  const title = doc.createElement("summary");
  title.textContent = "学习会话";
  const picker = doc.createElement("select");
  picker.setAttribute("aria-label", "继续学习会话");
  const audio = doc.createElement("select");
  audio.setAttribute("aria-label", "沿用会话录音");
  const question = doc.createElement("textarea");
  question.placeholder = "就本会话继续提问";
  const status = doc.createElement("p");
  let currentRecording: Recording | undefined;
  function button(text: string, action: () => Promise<void>) {
    const el = doc.createElement("button");
    el.textContent = text;
    el.onclick = async () => {
      el.disabled = true;
      try {
        await action();
      } catch (e) {
        status.textContent = (e as Error).message;
      } finally {
        el.disabled = false;
      }
    };
    return el;
  }
  async function write(change: (db: Library) => void) {
    await navigator.locks.request(store, () => {
      const db = load();
      change(db);
      GM_setValue(store, db);
    });
    render();
    refreshWindow();
    box.dispatchEvent(new Event("librarychange"));
  }
  function render() {
    const db = load(),
      s = active(db);
    picker.replaceChildren(
      new Option("选择会话", ""),
      ...db.sessions.map((x) => new Option(x.name, x.id)),
    );
    picker.value = s?.id ?? "";
    audio.replaceChildren(
      new Option("选择要沿用的录音", ""),
      ...(s?.recordings ?? []).map((r) => new Option(r.name, r.id)),
    );
    const g = group(),
      saved = s?.groups.find((x) => g && same(x.content, g));
    audio.value = saved?.audio ?? "";
    status.textContent = s
      ? `${s.name} · ${s.groups.map((x) => label(x.content)).join("、") || "尚未加入题组"} · ${s.recordings.length} 份录音复核`
      : "新建会话或选择已有会话。";
  }
  box.ontoggle = () => {
    if (box.open) render();
  };
  function changed() {
    currentRecording = undefined;
    invalidate();
  }
  picker.onchange = async () => {
    const id = picker.value;
    changed();
    await write((db) => {
      tabId = db.active = id;
    });
  };
  const create = button("新建学习会话", async () => {
    const name = doc
      .defaultView!.prompt("会话名称", "Unit 1 Lifestyle")
      ?.trim();
    if (!name) return;
    changed();
    await write((db) => {
      tabId = db.active = crypto.randomUUID();
      db.sessions.push({
        id: db.active,
        name,
        groups: [],
        recordings: [],
        turns: [],
      });
    });
  });
  function attach(s: Session, g: Group, recording?: Recording, local?: string) {
    let item = s.groups.find((x) => same(x.content, g));
    if (!item) {
      item = { content: g };
      s.groups.push(item);
    }
    if (local) item.transcript = local;
    if (recording) {
      if (!s.recordings.some((r) => r.id === recording.id))
        s.recordings.push(recording);
      item.audio = recording.id;
    }
  }
  const add = button("加入当前会话", async () => {
    const g = group(),
      id = active(load())?.id,
      recording = currentRecording,
      local = transcript();
    if (!g || !id) throw new Error("请先选择会话并提取本组。");
    invalidate();
    await write((db) => {
      const s = db.sessions.find((x) => x.id === id);
      if (s) attach(s, g, recording, local);
    });
  });
  const reuse = button("沿用所选录音", async () => {
    const g = group(),
      s = active(load()),
      r = s?.recordings.find((x) => x.id === audio.value);
    if (!s || !g || !r) throw new Error("请先提取本组并选择已复核的录音。");
    invalidate();
    currentRecording = r;
    await write((db) => {
      const target = db.sessions.find((x) => x.id === s.id);
      if (target) attach(target, g, r, transcript());
    });
  });
  function sessionInput(): StudyInput {
    const s = active(load());
    if (!s) throw new Error("请先开始会话。");
    if (!s.groups.length && purpose.value === "会话知识点")
      throw new Error("请先把题组加入会话。");
    const prompt =
      question.value.trim() ||
      (purpose.value === "会话知识点"
        ? "总结本会话知识点，合并相同考点并注明题组和题号。"
        : "");
    if (!prompt) throw new Error("请输入要追问的问题。");
    const texts: string[] = [];
    const ref = (t?: string) => {
      if (!t) return undefined;
      let i = texts.indexOf(t);
      if (i < 0) {
        i = texts.length;
        texts.push(t);
      }
      return i + 1;
    };
    const groups = s.groups.map((g) => ({
      题组: label(g.content),
      题面: g.content,
      本机转写编号: ref(g.transcript),
      音频复核编号: ref(s.recordings.find((r) => r.id === g.audio)?.text),
    }));
    return {
      task: purpose.value,
      question: prompt,
      session: {
        groups,
        texts,
        history: s.turns.slice(-4),
        currentNotes: s.notes,
      },
    };
  }
  const dialog = doc.createElement("div");
  dialog.className = "chat-window";
  const header = doc.createElement("h3");
  header.textContent = "会话追问与笔记";
  dialog.setAttribute("aria-label", header.textContent);
  const scope = doc.createElement("p");
  const purpose = doc.createElement("select");
  purpose.setAttribute("aria-label", "回复类型");
  for (const name of ["会话追问", "修订答案", "会话知识点"])
    purpose.add(new Option(name, name));
  const log = doc.createElement("div");
  log.className = "chat-log";
  const notice = doc.createElement("p");
  notice.setAttribute("role", "status");
  const material = doc.createElement("details"),
    caption = doc.createElement("summary"),
    payload = doc.createElement("pre");
  caption.textContent = "查看将发送的材料";
  material.append(caption, payload);
  function preview() {
    try {
      payload.textContent = JSON.stringify(sessionInput(), null, 2);
    } catch (e) {
      payload.textContent = (e as Error).message;
    }
  }
  function refreshWindow() {
    const s = active(load());
    scope.textContent = s
      ? s.name +
        " · " +
        (s.groups.map((g) => label(g.content)).join("、") || "尚未加入题组")
      : "请先新建或选择学习会话。";
    log.replaceChildren();
    for (const t of s?.turns ?? []) {
      const item = doc.createElement("details"),
        summary = doc.createElement("summary"),
        body = doc.createElement("div");
      summary.textContent = t.question.split("\n")[0].slice(0, 100);
      body.textContent = t.reply;
      item.append(summary, body);
      log.append(item);
    }
    if (log.lastElementChild instanceof HTMLDetailsElement)
      log.lastElementChild.open = true;
    download.disabled = !s?.notes;
    preview();
    log.scrollTop = log.scrollHeight;
  }
  const close = button("关闭小窗", async () => {
    box.dispatchEvent(new Event("requestquestions"));
  });
  const download = button("导出知识点 .md", async () => {
    const s = active(load());
    if (!s?.notes) return;
    const a = doc.createElement("a");
    a.download =
      (s.name.replace(/[\\/:*?"<>|]/g, "_") || "学习会话") + "-知识点.md";
    a.href = URL.createObjectURL(
      new Blob(["# " + s.name + " · 知识点\n\n" + s.notes + "\n"], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  });
  const submit = doc.createElement("button");
  submit.textContent = "发送给 DeepSeek";
  submit.onclick = async (event) => {
    if (!event.isTrusted || submit.disabled) return;
    const id = active(load())?.id;
    try {
      const input = sessionInput();
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      purpose.disabled = true;
      question.disabled = true;
      notice.textContent = "正在等待 DeepSeek 回复…";
      const reply = await study(input);
      await write((db) => {
        const s = db.sessions.find((x) => x.id === id);
        if (!s) return;
        s.turns.push({ question: input.task + " · " + input.question, reply });
        if (input.task === "会话知识点") s.notes = reply;
      });
      question.value = "";
      refreshWindow();
      notice.textContent =
        input.task === "会话知识点"
          ? "最新知识点已保存，可以导出 Markdown。"
          : "回复已保存。";
    } catch (e) {
      notice.textContent = (e as Error).message;
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      purpose.disabled = false;
      question.disabled = false;
    }
  };
  question.oninput = preview;
  purpose.onchange = preview;
  dialog.append(
    header,
    close,
    scope,
    log,
    purpose,
    question,
    material,
    submit,
    download,
    notice,
  );

  function openWindow(kind: string) {
    if (!submit.disabled) {
      purpose.value = kind;
      notice.replaceChildren();
    }
    box.dispatchEvent(new Event("requestchat"));
    refreshWindow();
    question.focus();
  }
  box.append(
    title,
    picker,
    create,
    add,
    status,
    audio,
    reuse,
    button("提取会话知识点", async () => openWindow("会话知识点")),
    button("打开追问小窗", async () => openWindow("会话追问")),
  );
  return {
    box,
    dialog,
    question,
    purpose,
    submit,
    log,
    material,
    notice,
    picker,
    create,
    add,
    audio,
    reuse,
    status,
    download,
    render,
    refreshWindow,
    current: () => active(load()),
    openNotes: () => openWindow("会话知识点"),
    contains: (g: Group) =>
      active(load())?.groups.some((x) => same(x.content, g)),
    id: () =>
      typeof GM_getValue === "function" ? (active(load())?.id ?? "") : "",
    local: (g: Group) =>
      active(load())?.groups.find((x) => same(x.content, g))?.transcript,
    cached: (hash: string) =>
      active(load())?.recordings.find((r) => r.id === hash),
    recording: () => {
      const g = group(),
        s = active(load());
      return (
        currentRecording ??
        s?.recordings.find(
          (r) => r.id === s.groups.find((x) => g && same(x.content, g))?.audio,
        )
      );
    },
    async remember(recording: Recording, id: string) {
      currentRecording = recording;
      const g = group();
      if (id && g)
        await write((db) => {
          const s = db.sessions.find((x) => x.id === id);
          if (s) attach(s, g, recording, transcript());
        });
    },
    async saveTurn(id: string, question: string, reply: string) {
      if (id)
        await write((db) =>
          db.sessions.find((s) => s.id === id)?.turns.push({ question, reply }),
        );
    },
    reset() {
      currentRecording = undefined;
      if (box.open) render();
    },
  };
}
