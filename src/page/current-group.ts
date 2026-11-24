import {
  directions,
  judgmentDirections,
  extractJudgments,
  extractListening,
  type Question,
} from "./listening";

export type Group =
  | { kind: "speaking"; page: number; total: number; collected: number; questions: Question[]; label: string }
  | { kind: "choices" | "judgments" | "heard"; questions: Question[]; label?: string }
  | { kind: "blanks"; passage: string; choicesByBlank?: string[][] };
export function groupSize(group: Group): number {
  return group.kind === "blanks"
    ? Array.from(group.passage.matchAll(/\(\d+\) ______/g)).length
    : group.questions.length;
}

function passageFrom(doc: Document, heading: Text, end?: Text, dropdown = false): string {
  const range = doc.createRange();
  range.selectNodeContents(doc.body);
  range.setStartAfter(heading);
  if (end) range.setEndBefore(end);
  const fragment = range.cloneContents();
  if (dropdown) {
    fragment.querySelectorAll('[role=listbox],ul,ol,[role=combobox],.el-select-dropdown,.ant-select-dropdown').forEach(el => el.remove());
  }
  fragment.querySelectorAll("script,style,audio,video,button,select,[hidden],[aria-hidden=true]").forEach(el => el.remove());
  for (const field of Array.from(fragment.querySelectorAll("input,textarea,[contenteditable=true]"))) {
    if (field.matches("input[type]:not([type=text])")) {
      field.remove();
    } else if (!field.matches("[contenteditable=true]") || !field.textContent?.trim()) {
      field.replaceWith(" ______ ");
    }
  }
  fragment.querySelectorAll("br").forEach(el => el.replaceWith("\n"));
  fragment.querySelectorAll("div,p,li,section,tr").forEach(el => el.append("\n"));
  let count = 0;
  const lines = (fragment.textContent ?? "").replace(/[\u200b\ufeff]/g, "").split(/\r?\n/)
    .map(line => line.trim().replace(/\s+/g, " "))
    .filter(line => line && !/^(?:(?:\d+:\d{2}|\d+(?:\.\d+)?\s*x|x)\s*)+$/i.test(line));
  const feedback = lines.findIndex(line => /^(?:(?:参考|正确|我的|你的)?答案|答案解析|解析|参考答案及解析)(?:$|\s*[:：]|\s*[(（])/u.test(line));
  let body = (feedback < 0 ? lines : lines.slice(0, feedback)).join("\n");
  if (dropdown) body = body.replace(/请选择[.…。]*/g, "");
  // 部分成绩页把题面渲染两遍，或在题面后直接列出从 1 开始的答案。
  const starts = Array.from(body.matchAll(/[(（]\s*1\s*[)）]/g));
  if (starts.length > 1) {
    const second = starts[1].index!;
    const prefix = body.slice(0, starts[0].index).trim();
    const preceding = body.slice(0, second).trimEnd();
    if (prefix && preceding.endsWith(prefix)) {
      body = preceding.slice(0, -prefix.length).trimEnd();
    } else {
      const numbers = (s: string) => Array.from(s.matchAll(/[(（]\s*(\d+)\s*[)）]/g), m => Number(m[1]));
      const first = numbers(preceding), repeated = numbers(body.slice(second));
      if (first.length > 1 && first.length === repeated.length &&
          first.every((n,i) => n === i + 1 && repeated[i] === n) &&
          /^\s*[(（]\s*1\s*[)）]/.test(body.slice(body.lastIndexOf("\n",second) + 1)))
        body = preceding;
    }
  }
  const passage = body.replace(/[(（]\s*(\d+)\s*[)）](?:\s*_{2,})?|_{2,}/g, (_, num) => {
    count++;
    if (num && Number(num) !== count)
      throw new Error(`填空编号不连续：第 ${count} 个位置读到了（${num}），请检查本组题目是否显示完整。`);
    return `(${count}) ______`;
  });
  if (!count) throw new Error("已找到填空说明，但尚未读到本组空位。");
  return passage;
}

type Heading = { node: Text; last: Text; top: number; direction: string };
const instruction =
  /^(?:Listen to|Watch the|Work (?:in|with)|Discuss\b|Answer the|Record\b|Talk (?:about|with)|Speak\b|Read the|Complete the|After you|Before you|Wrapping up|Task\s+\d+\s*$)/i;
const taskTitle = /^Task\s+\d+$/i;
const sectionTitle = /^(?:After you|Before you|Wrapping up|Discuss and organize ideas$|Task\s+\d+$)/i;
export function listeningHeadings(doc: Document, view = { top: 0, bottom: doc.defaultView!.innerHeight }) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const headings: Heading[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (
      !instruction.test(node.data.trim()) ||
      node.parentElement?.closest("nav,aside,[role=navigation],[role=tree],[role=treeitem]")
    )
      continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const bounds = range.getBoundingClientRect();
    if (!bounds.height || !bounds.width) continue;
    let last = node,
      direction = node.data.trim();
    // 教材有时将同一句说明中的关键词单独加粗。
    let parent = node.parentElement;
    while (
      parent &&
      parent !== doc.body &&
      parent.innerText?.trim().startsWith(direction)
    ) {
      const line = parent.innerText.trim();
      if (line.includes("\n") || line.length > 350) break;
      direction = line;
      const children = doc.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
      while (children.nextNode()) last = children.currentNode as Text;
      parent = parent.parentElement;
    }
    headings.push({ node, last, top: bounds.top, direction });
    walker.currentNode = last;
  }
  const height = view.bottom - view.top;
  // 目录可能只是普通 div。用正文中心的实际命中位置确定阅读栏。
  const x = doc.documentElement.clientWidth * 0.55;
  function inReadingColumn(h: Heading) {
    let el = h.node.parentElement;
    while (el && el !== doc.body) {
      const style = doc.defaultView!.getComputedStyle(el);
      if (!["inline","contents"].includes(style.display)) {
        const rect = el.getBoundingClientRect();
        if (rect.left <= x && rect.right >= x) return true;
        if (style.display === "block" && style.width !== "auto" && rect.width > doc.documentElement.clientWidth * 0.15) return false;
      }
      el = el.parentElement;
    }
    return false;
  }
  const visible = headings.filter((h) => {
    if (h.top < view.top || h.top >= view.bottom) return false;
    const range = doc.createRange();
    range.selectNodeContents(h.node);
    const rect = range.getClientRects()[0];
    if (!rect || !h.node.parentElement) return false;
    const hit = doc.elementFromPoint(rect.left + Math.min(2, rect.width / 2), rect.top + rect.height / 2);
    return !!hit && h.node.parentElement.contains(hit);
  });
  const candidates = visible.filter(inReadingColumn);
  const anchor = doc.elementFromPoint(x, view.top + height * 0.35);
  const preceding = anchor && headings.filter(h => inReadingColumn(h) &&
    h.top <= view.top + height * 0.35 &&
    (anchor.contains(h.node) || !!(h.node.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING))).at(-1);
  const near = candidates.filter(h => h.top < view.top + height * 0.55);
  let current =
    near.find(h => !sectionTitle.test(h.direction)) ??
    (preceding && !sectionTitle.test(preceding.direction) ? preceding : undefined) ??
    candidates.find(h => !sectionTitle.test(h.direction)) ??
    near.find(h => !taskTitle.test(h.direction)) ??
    preceding ?? visible.find(h => !sectionTitle.test(h.direction)) ??
    headings.filter(h => h.top <= view.top + height * 0.35).at(-1);
  if (current && taskTitle.test(current.direction))
    current = headings[headings.indexOf(current) + 1];
  const next = current ? headings[headings.indexOf(current) + 1] : undefined;
  return { current, next };
}

// 只读取两个说明/任务标题之间的可见文字。行内斜体与加粗仍属于同一题干。
function exerciseText(doc: Document, heading: Heading, end?: Text, markLetters = false) {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  walker.currentNode = heading.last;
  let text = "",
    block: Element | null = null;
  const win = doc.defaultView!;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node === end) break;
    let el = node.parentElement;
    if (
      !el ||
      !node.data.trim() ||
      el.closest("script,style,nav,aside,[hidden]")
    )
      continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    if (!range.getBoundingClientRect().height) continue;
    while (
      el.parentElement &&
      /^(inline|contents)$/.test(win.getComputedStyle(el).display)
    )
      el = el.parentElement;
    if (el !== block) text += "\n";
    else if (/(?:^|\n)[A-DFT]$/.test(text)) text += " ";
    text += markLetters && /^[A-Z]$/.test(node.data.trim()) ? "\n" + node.data.trim() + ". " : node.data;
    block = el;
  }
  return text;
}
const oralPages = new WeakMap<Document, Map<string, Map<number, Question>>>();
export async function currentGroup(doc: Document, view?: {top:number; bottom:number}): Promise<Group> {
  const { current, next } = listeningHeadings(doc, view);
  if (!current) throw new Error("未定位到当前题组，请把题目说明滚到页面上方。");
  const heading = current.direction;
  if (/\b(?:choose|select)\b.*\bcomplete\b.*\bsummary\b/i.test(heading)) {
    const passage = passageFrom(doc, current.last, next?.node, true);
    const group: Extract<Group,{kind:"blanks"}> = {kind:"blanks", passage};
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    range.setStartAfter(current.last);
    if (next) range.setEndBefore(next.node);
    const slots = Array.from({length:groupSize(group)}, ():string[] => []);
    const triggers = Array.from(doc.querySelectorAll<HTMLElement>("select,[role=combobox],span,div,button,input"))
      .filter(el => range.intersectsNode(el) && (el.matches("select,[role=combobox]") ||
        (!el.closest("[role=combobox],select") && !el.children.length && /^请选择[.…。]*$/.test((el.textContent || el.getAttribute("placeholder") || "").trim()))));
    for (const el of triggers) {
      const prefix = range.cloneRange();
      prefix.setEndBefore(el);
      const number = Number(Array.from(prefix.toString().matchAll(/[(（]\s*(\d+)\s*[)）]/g)).at(-1)?.[1]);
      if (!slots[number-1] || slots[number-1].length) continue;
      const optionText = (nodes: Element[]) => nodes.map(o => (o.textContent || "").trim())
        .filter(s => s && !/^请选择[.…。]*$/.test(s));
      if (el instanceof HTMLSelectElement) {
        slots[number-1] = optionText(Array.from(el.options));
        continue;
      }
      const read = () => {
        const linked = doc.getElementById(el.getAttribute("aria-controls") || el.getAttribute("aria-owns") || "");
        let root = el.parentElement;
        while (root && root !== doc.body && !linked) {
          if ((root.textContent?.match(/[(（]\s*\d+\s*[)）]/g)?.length || 0) > 1) break;
          const options = root.querySelectorAll("[role=option],li,.el-select-dropdown__item,.ant-select-item-option-content");
          if (options.length) return optionText(Array.from(options));
          root = root.parentElement;
        }
        return linked ? optionText(Array.from(linked.querySelectorAll("[role=option],li"))) : [];
      };
      let options = read();
      if (!options.length && el.getClientRects().length && !el.closest("button[type=submit]")) {
        const before = new Set(Array.from(doc.querySelectorAll("[role=option],li")).filter(o => o.getClientRects().length));
        el.click();
        try {
          await new Promise(resolve => setTimeout(resolve, 70));
          options = read();
          if (!options.length) {
            const opened = Array.from(doc.querySelectorAll("[role=option],li"))
              .filter(o => !before.has(o) && o.getClientRects().length);
            if (opened.length && opened.every(o => o.parentElement === opened[0].parentElement))
              options = optionText(opened);
          }
        } finally { el.click(); }
      }
      slots[number-1] = options;
    }
    group.choicesByBlank = slots;
    return group;
  }
  if (/\bfill\s+in\s+the\s+blanks?\b/i.test(heading))
    return {
      kind: "blanks",
      passage: passageFrom(doc, current.last, next?.node),
    };
  if (/\b(?:choose|select|tick|check)\b.*\b(?:ones|sentences|statements|phrases|expressions|words)\b.*\b(?:hear|heard)\b/i.test(heading)) {
    const lines = exerciseText(doc,current,next?.node,true).split(/\n/).map(line => line.trim()).filter(Boolean);
    const options: string[] = [];
    for (const line of lines) {
      if (/^(?:正确答案|参考答案|我的答案|答案|解析)(?:[:：\s]|$)/.test(line)) break;
      const letter = String.fromCharCode(65 + options.length);
      const marker = /^([A-Z])(?:[.．、]\s*|\s+)(.*)$/.exec(line);
      if (marker?.[1] === letter) {
        if (options.length && !options.at(-1)) throw new Error("听力多选有空白候选句，请重新提取。");
        options.push(marker[2].trim());
      } else if (options.length) {
        if (/^[A-Z][.．、](?:\s|$)/.test(line)) throw new Error("听力多选选项编号不连续，请检查题组。");
        options[options.length-1] = (options.at(-1) + " " + line).trim();
      }
    }
    if (options.length < 2 || !options.at(-1)) throw new Error("尚未读到完整的听力多选候选句。");
    return {kind:"heard",label:"听力多选",questions:[{stem:heading,options}]};
  }
  const judgments = /decide whether.*(?:true|false)/i.test(heading);
  const choices = /choose the best answer to each/i.test(heading);
  if (!judgments && !choices && /\b(?:discuss|speak|speaking|record(?:ing)?|talk about|answer the questions?)\b/i.test(heading)) {
    const body = exerciseText(doc, current, next?.node);
    const pager = /(?:^|\n)\s*(\d+)\s*\/\s*(\d+)(?=\s|上一个|下一个|$)/.exec(body);
    if (pager && /准备时长|作答时长|点击开始|开始录音/.test(body)) {
      const page = Number(pager[1]), total = Number(pager[2]);
      const prompt = body.slice(pager.index + pager[0].length).split(/准备时长|作答时长|点击开始|开始录音/)[0];
      const numbered = /(?:^|\n)\s*(\d+)\s*[.．、)]\s*([\s\S]+)/.exec(prompt);
      if (!numbered || Number(numbered[1]) !== page || page < 1 || page > total || !/[a-z]/i.test(numbered[2]))
        throw new Error("口语题页码与可见题干尚未对应，请等翻页完成后重新提取。");
      const sections = oralPages.get(doc) ?? new Map<string, Map<number, Question>>();
      oralPages.set(doc, sections);
      const range = doc.createRange();
      range.selectNodeContents(doc.body);
      range.setEndBefore(current.node);
      const ordinal = range.toString().split(current.node.data).length;
      const key = JSON.stringify([doc.URL, heading, ordinal, total]);
      const pages = sections.get(key) ?? new Map<number, Question>();
      const question = {stem:numbered[2].trim().replace(/\s+/g," "),options:[]};
      if (pages.has(page) && pages.get(page)?.stem !== question.stem) pages.clear();
      pages.set(page, question);
      sections.set(key, pages);
      const complete = pages.size === total;
      return {kind:"speaking", page, total, collected:pages.size, label:`口语讨论 · 第 ${page}/${total} 题`,
        questions:complete ? Array.from({length:total}, (_, i) => pages.get(i + 1)!) : [question]};
    }
  }
  if (!judgments && !choices)
    throw new Error("当前题组的作答形式暂未支持：" + heading);
  const content = exerciseText(doc, current, next?.node);
  const group: Group = {
    kind: judgments ? "judgments" : "choices",
    questions: judgments
      ? extractJudgments(content)
      : extractListening(content),
  };
  if (heading !== directions && heading !== judgmentDirections)
    group.label =
      (/^Watch/i.test(heading) ? "视频" : "听力") +
      (judgments ? "判断" : "单选");
  return group;
}
