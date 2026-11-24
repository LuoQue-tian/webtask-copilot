type Segment = { start: number; text: string };
declare function GM_xmlhttpRequest(options: {
  method: string;
  url: string;
  headers: Record<string, string>;
  data: ArrayBuffer;
  timeout: number;
  onload: (r: { status: number; responseText: string }) => void;
  onerror: () => void;
  ontimeout: () => void;
}): void;

export async function decodeSpeech(blob: Blob) {
  if (blob.size > 64 * 1024 * 1024)
    throw new Error("请选择小于 64 MiB 的听力文件。");
  const rate = 16000;
  const decoder = new OfflineAudioContext(1, 1, rate);
  const audio = await decoder.decodeAudioData(await blob.arrayBuffer());
  if (audio.duration > 600) throw new Error("当前支持 10 分钟以内的音频。");
  const context = new OfflineAudioContext(1, audio.length, rate);
  const source = context.createBufferSource();
  source.buffer = audio;
  source.connect(context.destination);
  source.start();
  const samples = (await context.startRendering()).getChannelData(0);
  return Int16Array.from(samples, (s) =>
    Math.round(Math.max(-1, Math.min(1, s)) * 32767),
  );
}

export function speechWav(data: Int16Array): Blob {
  const rate = 16000;
  const buffer = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buffer);
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, data.byteLength, true);
  new Int16Array(buffer, 44).set(data);
  return new Blob([buffer], { type: "audio/wav" });
}

export async function transcribe(blob: Blob): Promise<string> {
  const pcm = await decodeSpeech(blob);
  const segments = await new Promise<Segment[]>((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "POST",
      url: "http://127.0.0.1:4180/transcribe",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-WebTask-Audio": "pcm16",
      },
      data: pcm.buffer,
      timeout: 180000,
      onload: (r) => {
        if (r.status !== 200)
          return reject(
            new Error(
              r.status === 409
                ? "已有转写正在运行，请稍后再试。"
                : "本机转写服务返回错误。",
            ),
          );
        try {
          const rows = JSON.parse(r.responseText);
          if (
            !Array.isArray(rows) ||
            !rows.every(
              (s) => Number.isFinite(s?.start) && typeof s.text === "string",
            )
          )
            throw new Error();
          resolve(rows);
        } catch {
          reject(new Error("无法读取本机转写结果。"));
        }
      },
      onerror: () =>
        reject(
          new Error(
            "请运行 WebTaskCopilot 目录中的「启动英文转写.cmd」后重试。",
          ),
        ),
      ontimeout: () => reject(new Error("转写超时，请稍后重试。")),
    });
  });
  if (!segments.length) throw new Error("未识别到英文语音。");
  return segments
    .map((s) => {
      const sec = Math.floor(s.start);
      return `[${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}] ${s.text}`;
    })
    .join("\n\n");
}
