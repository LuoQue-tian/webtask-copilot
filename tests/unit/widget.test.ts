// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { mountWidget } from "../../src/ui/widget";

beforeEach(() => document.body.replaceChildren());

it("重复启动只创建一个助手，原页面内容保留", () => {
  const original = document.createElement("p");
  document.body.append(original);
  mountWidget(document);
  mountWidget(document);
  expect(document.querySelectorAll("#webtask-copilot-widget")).toHaveLength(1);
  expect(original.isConnected).toBe(true);
});
