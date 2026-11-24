import { afterEach, expect, it, vi } from "vitest";
import { deepseek } from "../../src/ai/deepseek";

afterEach(() => vi.unstubAllGlobals());
it.each(["9:59", "0:18"])("校验回听时间 %s 是否来自输入转写", async (stamp) => {
  vi.stubGlobal(
    "GM_xmlhttpRequest",
    vi.fn((opts) =>
      opts.onload({
        status: 200,
        responseText: JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  answer: "参考词",
                  needsReview: true,
                  explanation: "根据上下文核对。",
                  points: ["关键词"],
                  listenAt: [stamp],
                }),
              },
            },
          ],
        }),
      }),
    ),
  );
  const result = deepseek.study("local-test", {
    task: "讲解本题",
    question: "Q",
    transcript: "[0:18] English sample",
  });
  if (stamp === "0:18")
    await expect(result).resolves.toContain("建议回听 0:18");
  else await expect(result).rejects.toThrow("回听时间");
});
it("超时返回可读提示", async () => {
  vi.stubGlobal(
    "GM_xmlhttpRequest",
    vi.fn((opts) => opts.ontimeout()),
  );
  await expect(deepseek.test("local-test")).rejects.toThrow("超时");
});
