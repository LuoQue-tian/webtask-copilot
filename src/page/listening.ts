export const directions =
  "Listen to the passage again and choose the best answer to each of the following questions.";
export type Question = { stem: string; options: string[] };
export const judgmentDirections =
  "Listen to the passage and decide whether the following statements are true (T) or false (F).";
const feedback = /^(?:参考答案|正确答案|我的答案|答案|解析)(?:\s|[:：]|$)/;
// 播放器倍速 1.0 紧邻第一题，数字小数点不能当成题号分隔符。
const numberedStem = /^(\d+)[.．、](?!\d)\s*(.*)$/;

export function extractListening(text: string): Question[] {
  const group = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let i = group.findIndex((line) => numberedStem.exec(line)?.[1] === "1");
  if (i < 0) throw new Error("本组尚未读到第 1 道单选题。");
  const questions: Question[] = [];
  for (let number = 1; i < group.length; number++) {
    const incomplete = () =>
      new Error(`第 ${number} 题的题干或选项不完整，请检查页面后重新提取。`);
    const match = numberedStem.exec(group[i++] ?? "");
    if (!match || Number(match[1]) !== number) throw incomplete();
    const stem = match[2] || group[i++];
    if (!stem) throw incomplete();
    const options: string[] = [];
    for (const label of "ABCD") {
      const marker = /^([A-D])(?:(?:[.．、]\s*|\s+)(.*))?$/.exec(
        group[i++] ?? "",
      );
      if (!marker || marker[1] !== label) throw incomplete();
      const option = marker[2] || group[i++];
      if (
        !option ||
        feedback.test(option) ||
        /^(?:[A-D](?:[.．、]|$)|\d+[.．、])/.test(option)
      )
        throw incomplete();
      options.push(option);
    }
    questions.push({ stem, options });
    if (feedback.test(group[i] ?? "")) {
      while (i < group.length && !numberedStem.test(group[i])) i++;
    }
  }
  return questions;
}

export function extractJudgments(text: string): Question[] {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const questions: Question[] = [];
  let continuation = false;
  for (const raw of lines) {
    if (raw === directions || /^Task\s+\d+\b/i.test(raw)) break;
    const line = raw.replace(/^T\s*F\s*(?=\d+[.．、])/, "");
    const match = numberedStem.exec(line);
    if (match) {
      if (Number(match[1]) !== questions.length + 1)
        throw new Error("Task 1 判断题题号不连续。");
      questions.push({ stem: match[2], options: ["T", "F"] });
      continuation = true;
    } else if (/^(?:T|F|T\s*F)$/.test(line) || feedback.test(line)) {
      continuation = false;
    } else if (continuation) {
      const last = questions[questions.length - 1];
      last.stem = (last.stem + " " + line).trim();
    }
  }
  if (!questions.length || questions.some((q) => !q.stem))
    throw new Error(`当前题组有缺失的判断题题干，请核对正文。`);
  return questions;
}
