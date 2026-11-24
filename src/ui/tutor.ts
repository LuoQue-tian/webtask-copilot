import {
  deepseek,
  defaultModel,
  listModels,
  type StudyInput,
} from "../ai/deepseek";
import { groupSize, type Group } from "../page/current-group";
import { reviewAudio } from "../ai/audio-review";
import { sessionControls } from "./study-session";

declare function GM_getValue(name: string, fallback: string): string;
declare function GM_setValue(name: string, value: string): void;
const storageKey = "deepseek-api-key";

export function tutorPanel(
  doc: Document,
  transcript: () => string,
  panelTranscript = transcript,
) {
  const box = doc.createElement("details");
  box.className = "tutor";
  const heading = doc.createElement("summary");
  heading.textContent = "DeepSeek 学习辅导";
  const status = doc.createElement("p");
  status.setAttribute("role", "status");
  function button(label: string) {
    const el = doc.createElement("button");
    el.type = "button";
    el.textContent = label;
    return el;
  }
  const configure = button("配置密钥");
  const connect = button("测试连接");
  const model = doc.createElement("select");
  model.setAttribute("aria-label", "文本模型");
  const preferred =
    typeof GM_getValue === "function"
      ? GM_getValue("webtask-text-model", defaultModel)
      : defaultModel;
  model.add(new Option(preferred, preferred));
  model.onchange = () => GM_setValue("webtask-text-model", model.value);
  const connection = doc.createElement("p");
  connection.setAttribute("role", "status");
  connection.textContent =
    typeof GM_getValue === "function" && GM_getValue(storageKey, "")
      ? "密钥已配置 · 待测试"
      : "尚未配置 API Key";
  const select = doc.createElement("select");
  select.setAttribute("aria-label", "选择要讲解的题目");
  const mode = doc.createElement("select");
  mode.setAttribute("aria-label", "辅导方式");
  for (const text of ["讲解本题", "提取知识点", "草稿反馈"])
    mode.add(new Option(text, text));
  const draft = doc.createElement("textarea");
  draft.placeholder = "输入你想获得反馈的草稿";
  draft.setAttribute("aria-label", "我的草稿");
  draft.hidden = true;
  const prepare = button("预览发送内容");
  const reuseLabel = doc.createElement("label");
  const reuse = doc.createElement("input");
  reuse.type = "checkbox";
  reuse.onchange = () => reset();
  reuseLabel.append(reuse, "沿用面板中的英文转写");
  reuseLabel.hidden = true;
  const audioBox = doc.createElement("details");
  const audioTitle = doc.createElement("summary");
  audioTitle.textContent = "用已下载的录音复核（可选）";
  const file = doc.createElement("input");
  file.type = "file";
  file.accept = "audio/*,.audio,.m4a,.mp3,.wav";
  file.setAttribute("aria-label", "选择本组录音");
  const review = button("上传所选录音给 DeepSeek 复核");
  const note = doc.createElement("p");
  note.textContent =
    "选择本组录音后，点击上传会按音频时长计费。识别结果可随题面一起预览。";
  const audioState = doc.createElement("p");
  audioState.setAttribute("role", "status");
  audioBox.append(audioTitle, file, note, review, audioState);
  let fileVersion = 0;
  file.onchange = () => {
    fileVersion++;
    reset();
    audioState.textContent = "";
  };
  review.onclick = async (event) => {
    const selectedFile = file.files?.[0];
    if (!event.isTrusted || review.disabled) return;
    if (!selectedFile) {
      audioState.textContent = "请先选择要复核的录音。";
      return;
    }
    const version = fileVersion;
    reset();
    review.disabled = true;
    review.setAttribute("aria-busy", "true");
    audioState.textContent = "正在读取录音并检查已有复核…";
    file.disabled = true;
    try {
      const id = sessions.id();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await selectedFile.arrayBuffer(),
      );
      const hash = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      if (version !== fileVersion) return;
      const cached = sessions.cached(hash);
      const value =
        cached?.text ??
        (await reviewAudio(key(), selectedFile, (text) => {
          if (version === fileVersion) audioState.textContent = text;
        }));
      if (version === fileVersion) {
        await sessions.remember(
          { id: hash, name: selectedFile.name, text: value },
          id,
        );
        reset();
        audioState.textContent =
          (cached ? "已复用 " : "已复核 ") +
          selectedFile.name +
          "，可用于本组各题。";
      }
    } catch (error) {
      if (version === fileVersion)
        audioState.textContent = (error as Error).message;
    } finally {
      file.disabled = false;
      review.disabled = false;
      review.removeAttribute("aria-busy");
    }
  };
  const preview = doc.createElement("pre");
  const reference = doc.createElement("p");
  const previewDetails = doc.createElement("details");
  const previewTitle = doc.createElement("summary");
  previewTitle.textContent = "查看完整发送材料";
  previewDetails.append(previewTitle, preview);
  previewDetails.hidden = true;
  const send = button("发送给 DeepSeek");
  send.hidden = true;
  const result = doc.createElement("div");
  result.className = "tutor-result";
  let selected: Group | undefined,
    pending: StudyInput | undefined,
    revision = 0;
  function showPreview(input: StudyInput) {
    pending = input;
    reference.textContent = [
      select.selectedOptions[0]?.textContent,
      input.transcript ? "已附英文转写" : "未附转写",
      input.reviewedAudio ? "已附录音复核" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    previewDetails.hidden = false;
    preview.hidden = false;
    preview.textContent = JSON.stringify(input, null, 2);
    send.hidden = false;
  }
  function chosenTranscript() {
    if (reuse.checked) return panelTranscript();
    return selected?.kind === "speaking" ? "" : transcript();
  }
  const sessions = sessionControls(
    doc,
    () => selected,
    chosenTranscript,
    (input) => deepseek.study(key(), input, model.value),
    () => {
      fileVersion++;
      reset();
      audioState.replaceChildren();
    },
  );
  function reset() {
    revision++;
    pending = undefined;
    reference.textContent = "";
    previewDetails.hidden = true;
    preview.replaceChildren();
    result.replaceChildren();
    send.hidden = true;
    status.replaceChildren();
  }
  function key() {
    const value = GM_getValue(storageKey, "");
    if (!value)
      throw new Error("请先点「配置密钥」，在本机输入 DeepSeek API Key。");
    return value;
  }
  if (typeof GM_getValue === "function" && GM_getValue(storageKey, ""))
    connection.textContent = GM_getValue(
      "webtask-connection-status",
      "密钥已配置 · 待测试",
    );
  configure.onclick = (e) => {
    if (!e.isTrusted) return;
    const value = doc.defaultView!.prompt(
      "输入 DeepSeek API Key。密钥保存在油猴中；留空并确定可清除。",
    );
    if (value === null) return;
    GM_setValue(storageKey, value.trim());
    GM_setValue("webtask-connection-status", "密钥已配置 · 待测试");
    reset();
    connection.textContent = value.trim()
      ? "密钥已保存 · 待测试"
      : "密钥已清除。";
  };
  connect.onclick = async (e) => {
    if (!e.isTrusted) return;
    connect.disabled = true;
    connection.textContent = "正在测试连接…";
    configure.disabled = true;
    try {
      const ids = await listModels(key());
      const previous = model.value;
      model.replaceChildren(...ids.map((id) => new Option(id, id)));
      model.value = ids.includes(previous) ? previous : ids[0];
      GM_setValue("webtask-text-model", model.value);
      connection.textContent = "连接成功。";
      GM_setValue(
        "webtask-connection-status",
        "上次连接成功 · " + new Date().toLocaleString(),
      );
    } catch (error) {
      connection.textContent = (error as Error).message;
      GM_setValue(
        "webtask-connection-status",
        "上次测试 · " + connection.textContent,
      );
    } finally {
      configure.disabled = false;
      connect.disabled = false;
    }
  };
  mode.onchange = () => {
    reset();
    draft.hidden = mode.value !== "草稿反馈";
  };
  function syncScope() {
    mode.options[0].textContent =
      select.value === "all" ? "回答整组题目" : "讲解本题";
  }
  select.onchange = () => {
    reset();
    syncScope();
  };
  draft.oninput = reset;
  prepare.onclick = () => {
    reset();
    if (mode.value === "提取知识点" && sessions.id()) {
      sessions.openNotes();
      return;
    }
    if (!selected) {
      status.textContent = "请先点击「提取本组」。";
      return;
    }
    const all = select.value === "all";
    const judgment = selected.kind === "judgments";
    const index = Number(select.value);
    const input: StudyInput = {
      task: all && mode.value === "讲解本题" ? "回答整组题目" : mode.value,
      question: all
        ? selected.kind === "blanks"
          ? selected.passage
          : selected.questions
              .map(
                (q, i) =>
                  `${i + 1}. ${q.stem}\n${q.options.map((o, j) => (judgment ? o : String.fromCharCode(65 + j) + ". " + o)).join("\n")}`,
              )
              .join("\n\n")
        : selected.kind === "blanks"
          ? `请分析第 ${index + 1} 空。\n${selected.passage}`
          : selected.questions[index].stem,
    };
    if (selected.kind === "heard")
      input.question = "听力多选：对照转写逐项核对，列出所有听到的候选句及字母；缺少依据时标明待核对。\n" + input.question;
    if (selected.kind === "judgments")
      input.question = "判断正误，使用 T 或 F 作答。\n" + input.question;
    if (selected.kind === "blanks" && selected.choicesByBlank) {
      const choices = selected.choicesByBlank;
      if (
        all
          ? choices.some((options) => !options.length)
          : !choices[index]?.length
      ) {
        status.textContent =
          "所选空位的候选词尚未读全，请展开缺失的下拉框后重新提取。";
        return;
      }
      input.question =
        "从每个空自己的候选项中选择，保留原词。\n" + input.question;
      if (all)
        input.question +=
          "\n" +
          choices
            .map((opts, i) => `第 ${i + 1} 空候选：${opts.join(" / ")}`)
            .join("\n");
      else input.options = choices[index];
    }
    if (selected.kind === "speaking") {
      input.speaking = true;
      if (all) input.groupSize = selected.total;
      else {
        const number =
          selected.questions.length === selected.total
            ? index + 1
            : selected.page;
        input.question = `口语讨论 · 第 ${number}/${selected.total} 题\n${selected.questions[index].stem}`;
      }
    } else if (all) input.groupSize = groupSize(selected);
    else if (selected.kind !== "blanks")
      input.options = selected.questions[index].options;
    const text = chosenTranscript() ||
      ((selected.kind !== "speaking" || reuse.checked) && sessions.local(selected));
    if (text) input.transcript = text;
    const reviewed = sessions.recording()?.text;
    if (reviewed) input.reviewedAudio = reviewed;
    if (mode.value === "草稿反馈") {
      if (!draft.value.trim()) {
        status.textContent = "请先输入草稿。";
        return;
      }
      input.draft = draft.value.trim();
    }
    showPreview(input);
    status.textContent =
      text && reuse.checked
        ? "预览已包含英文转写（transcript），请核对是否对应本题组。"
        : text || reviewed
          ? "将发送以下文本给 DeepSeek。"
          : "当前无听力转写，可先转写再预览，或仅分析以下题面。";
    send.hidden = false;
  };
  send.onclick = async (e) => {
    if (!pending || !e.isTrusted || send.disabled) return;
    const version = revision;
    const sessionId = sessions.id();
    const input = pending;
    send.disabled = true;
    status.textContent = "DeepSeek 正在生成…";
    try {
      const output = await deepseek.study(key(), input, model.value);
      if (
        sessionId &&
        (input.session || (selected && sessions.contains(selected)))
      )
        await sessions.saveTurn(
          sessionId,
          input.task + " · " + input.question,
          output,
        );
      if (version === revision) {
        result.textContent = output;
        box.dispatchEvent(new Event("analysisdone"));
        preview.hidden = true;
        status.textContent = "辅导完成。";
        send.hidden = true;
      }
    } catch (error) {
      if (version === revision) status.textContent = (error as Error).message;
    } finally {
      send.disabled = false;
    }
  };
  box.append(
    heading,
    configure,
    connect,
    sessions.box,
    select,
    mode,
    draft,
    audioBox,
    reuseLabel,
    prepare,
    status,
    reference,
    previewDetails,
    send,
    result,
  );
  return {
    box,
    sessions,
    configure,
    connect,
    model,
    connection,
    audioBox,
    result,
    prepare,
    setGroup(group?: Group) {
      reset();
      fileVersion++;
      file.value = "";
      audioState.textContent = "";
      selected = group;
      reuseLabel.hidden = !group;
      reuse.checked = group?.kind === "speaking" && !!panelTranscript();
      sessions.reset();
      select.replaceChildren();
      draft.value = "";
      if (
        group &&
        (group.kind !== "speaking" || group.questions.length === group.total)
      )
        select.add(
          new Option(
            group.kind !== "blanks"
              ? "整组题目（共 " + group.questions.length + " 题）"
              : `整组题目（共 ${groupSize(group)} 空）`,
            "all",
          ),
        );
      if (group)
        for (let i = 0; i < groupSize(group); i++) {
          const label =
            group.kind !== "blanks"
              ? `第 ${group.kind === "speaking" && group.questions.length !== group.total ? group.page : i + 1} 题 · ${group.questions[i].stem}`
              : `第 ${i + 1} 空`;
          select.add(new Option(label, String(i)));
        }
      if (group)
        select.value = String(
          group.kind === "speaking" && group.questions.length === group.total
            ? group.page - 1
            : 0,
        );
      syncScope();
    },
  };
}
