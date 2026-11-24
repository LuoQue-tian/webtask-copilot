import { expect, it } from "vitest";
import { speechChunks } from "../../src/ai/audio-review";

it("4:01 的录音完整切分，每段包含合法的 16 kHz WAV 头", async () => {
  const pcm = new Int16Array(241 * 16000);
  const blocks = Array.from(speechChunks(pcm));
  let offset = 0;
  for (const { seconds, wav } of blocks) {
    const bytes = await wav.arrayBuffer();
    expect(seconds).toBe(Math.floor(offset / 16000));
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new DataView(bytes).getUint32(24, true)).toBe(16000);
    expect(wav.size).toBeLessThan(8 * 1024 * 1024);
    const count = (bytes.byteLength - 44) / 2;
    expect(count).toBeLessThanOrEqual(30 * 16000);
    offset += count;
  }
  expect(offset).toBe(pcm.length);
});
