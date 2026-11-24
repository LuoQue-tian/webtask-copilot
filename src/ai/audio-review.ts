import { decodeSpeech, speechWav } from "../ui/speech";
declare function GM_xmlhttpRequest(options: {
  method: string;
  url: string;
  anonymous: boolean;
  redirect: "error";
  headers: Record<string, string>;
  data: FormData;
  timeout: number;
  onload: (r: { status: number; responseText: string }) => void;
  onerror: () => void;
  ontimeout: () => void;
}): void;

// 每段约半分钟，在末尾三秒内寻找最安静的 100ms，减少切断单词。
export function* speechChunks(pcm: Int16Array) {
  const rate = 16000;
  for (let start = 0; start < pcm.length;) {
    let end = Math.min(start + 30 * rate, pcm.length);
    if (end < pcm.length) {
      let lowest = Infinity;
      const limit = end;
      for (let pos = limit - 3 * rate; pos + 1600 <= limit; pos += 1600) {
        let energy = 0;
        for (let i = pos; i < pos + 1600; i++) energy += pcm[i] * pcm[i];
        if (energy <= lowest) {
          lowest = energy;
          end = pos + 800;
        }
      }
    }
    const data = pcm.subarray(start, end);
    yield {
      seconds: Math.floor(start / rate),
      wav: speechWav(data),
    };
    start = end;
  }
}

export async function reviewAudio(
  key: string,
  file: File,
  progress: (text: string) => void,
) {
  const pcm = await decodeSpeech(file);
  const rows: string[] = [];
  for (const { seconds, wav } of speechChunks(pcm)) {
    const stamp =
      Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    progress("DeepSeek 正在辨听 " + stamp + " 起的音频…");
    const form = new FormData();
    form.append("file", wav, "segment.wav");
    const text = await new Promise<string>((resolve, reject) =>
      GM_xmlhttpRequest({
        method: "POST",
        url: "https://api.deepseek.com/v1/tools/asr",
        anonymous: true,
        redirect: "error",
        headers: { Authorization: "Bearer " + key },
        data: form,
        timeout: 90000,
        onload: (r) => {
          if (r.status !== 200)
            return reject(
              new Error(
                "音频复核失败（" +
                  r.status +
                  "），请检查余额、权限或稍后重试。",
              ),
            );
          try {
            const t = JSON.parse(r.responseText).text;
            if (typeof t !== "string") throw new Error();
            resolve(t.trim());
          } catch {
            reject(new Error("音频复核返回格式异常。"));
          }
        },
        onerror: () => reject(new Error("音频上传失败，请检查网络。")),
        ontimeout: () => reject(new Error("音频复核超时。")),
      }),
    );
    if (text) rows.push("[" + stamp + "] " + text);
  }
  if (!rows.length) throw new Error("未辨认出语音。");
  return rows.join("\n\n");
}
