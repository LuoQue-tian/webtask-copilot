import { listeningHeadings } from "./current-group";
import { decodeSpeech, speechWav } from "../ui/speech";

function playerFor(doc: Document, view?: {top:number; bottom:number}, originalVideo = false) {
  const { current, next } = listeningHeadings(doc, view);
  if (!current || !/^(?:Listen to|Watch the)/i.test(current.direction))
    throw new Error("请打开带音频或视频播放器的题组。");
  const video = /^Watch the/i.test(current.direction);
  if (originalVideo && !video) throw new Error("请切换到带视频播放器的题组后再下载。");
  const players = Array.from(doc.querySelectorAll<HTMLMediaElement>(video ? "video" : "audio")).filter(
    (el) =>
      current.node.compareDocumentPosition(el) &
        Node.DOCUMENT_POSITION_FOLLOWING &&
      (!next ||
        el.compareDocumentPosition(next.node) &
          Node.DOCUMENT_POSITION_FOLLOWING),
  );
  if (players.length !== 1)
    throw new Error("未定位到本组唯一的媒体播放器，请检查当前题组。");
  return players[0];
}

async function playThrough(player: HTMLMediaElement, start: () => void) {
  if (!Number.isFinite(player.duration) || player.duration <= 0 || player.duration > 600)
    throw new Error("请先加载视频；按播放提取支持十分钟以内的教材。");
  const position = player.currentTime, paused = player.paused, speed = player.playbackRate;
  let dispose = () => {};
  try {
    player.pause();
    player.currentTime = 0;
    player.playbackRate = 1;
    await new Promise<void>((resolve,reject) => {
      const fail = () => reject(new Error("教材播放中断，未取得完整媒体。"));
      const timer = window.setTimeout(fail,(player.duration + 25)*1000);
      dispose = () => {
        clearTimeout(timer);
        player.removeEventListener("ended",done);
        player.removeEventListener("error",fail);
        player.removeEventListener("emptied",fail);
      };
      const done = () => resolve();
      player.addEventListener("ended",done);
      player.addEventListener("error",fail);
      player.addEventListener("emptied",fail);
      start();
      player.play().catch(reject);
    });
  } finally {
    dispose();
    player.pause();
    player.playbackRate = speed;
    player.currentTime = position;
    if (!paused) void player.play().catch(()=>{});
  }
}

export function playChapter(doc:Document, view?: {top:number;bottom:number}) {
  return playThrough(playerFor(doc,view),()=>{});
}

async function capturePlayer(player: HTMLMediaElement, includeVideo: boolean) {
  const stream = (player as HTMLVideoElement & {captureStream?:()=>MediaStream}).captureStream?.();
  if (!stream) throw new Error("播放器不提供可读取的媒体轨道。");
  let recorder: MediaRecorder | undefined;
  const chunks: Blob[] = [];
  let stopped: Promise<void> | undefined;
  try {
    await playThrough(player, () => {
      const tracks = includeVideo ? stream.getTracks() : stream.getAudioTracks();
      if (!tracks.some(t => t.kind === (includeVideo ? "video" : "audio")) || tracks.some(t => t.muted))
        throw new Error("播放器未提供可用轨道。");
      recorder = new MediaRecorder(new MediaStream(tracks), {mimeType: includeVideo ? "video/webm" : "audio/webm;codecs=opus"});
      recorder.ondataavailable = event => { if(event.data.size) chunks.push(event.data); };
      stopped = new Promise(resolve => {recorder!.onstop = () => resolve();});
      recorder.start(1000);
    });
    if (recorder?.state === "recording") recorder.stop();
    await stopped;
    if (!chunks.length) throw new Error("未录到有效媒体。");
    return new Blob(chunks,{type:includeVideo ? "video/webm":"audio/webm"});
  } finally {
    if(recorder?.state === "recording") recorder.stop();
    stream.getTracks().forEach(t=>t.stop());
  }
}

export async function chapterAudio(doc: Document, view?: {top:number;bottom:number}, originalVideo = false): Promise<Blob> {
  const player = playerFor(doc,view,originalVideo);
  const video = player instanceof HTMLVideoElement;
  try { return await directFile(player,video,originalVideo); }
  catch(error) {
    if (!video || player.mediaKeys) throw error;
    try { return await capturePlayer(player,originalVideo); }
    catch {throw new Error(originalVideo ? "视频文件无法直读，播放器也未提供可保存的画面轨道。" : "播放器音轨无法直读，可共享教材标签页声音。",{cause:error});}
  }
}
declare function GM_download(options: {
  url:string; name:string; onload:()=>void; onerror:()=>void; ontimeout:()=>void;
}): void;

// 跨域文件可能允许浏览器下载，但无法由章节页面的 fetch 读取。
export async function downloadChapterVideo(doc:Document,view?:{top:number;bottom:number}) {
  const player = playerFor(doc,view,true);
  const src = player.currentSrc || player.src || player.querySelector("source")?.src;
  if (!player.mediaKeys && src?.startsWith("https:") && typeof GM_download === "function") {
    const extension = /\.(mp4|webm|ogv|mov)$/i.exec(new URL(src).pathname)?.[1];
    if(extension) {
      try {
        await new Promise<void>((resolve,reject)=>GM_download({url:src,name:"教材视频."+extension.toLowerCase(),
          onload:resolve,onerror:()=>reject(new Error("浏览器下载失败")),ontimeout:()=>reject(new Error("视频下载超时"))}));
        return {downloaded:true};
      } catch { /* 继续尝试当前页面可读取的文件或播放器轨道。 */ }
    }
  }
  return {audio:await chapterAudio(doc,view,true)};
}
async function directFile(player:HTMLMediaElement,video:boolean,originalVideo:boolean) {
  const src =
    player.currentSrc || player.src || player.querySelector("source")?.src;
  if (!src || !/^(https:|blob:)/.test(src))
    throw new Error("播放器还未提供音频文件，请先播放一次。");
  let result: Response;
  try {
    result = await fetch(src, { signal: AbortSignal.timeout(45000) });
  } catch {
    throw new Error("浏览器无法读取播放器的音频文件，请播放后重试。");
  }
  if (!result.ok) throw new Error("未能读取本组媒体文件。");
  const limit = (video ? 64 : 40) * 1024 * 1024;
  if (Number(result.headers.get("content-length")) > limit)
    throw new Error(`本组媒体文件超过 ${video ? 64 : 40} MiB。`);
  const blob = await result.blob();
  if (
    !blob.size ||
    blob.size > limit ||
    /text\/|mpegurl|json/i.test(blob.type)
  )
    throw new Error("需要可读取的单个媒体文件，暂不支持分段播放列表。");
  if (originalVideo) {
    if (blob.type.startsWith("video/")) return blob;
    const bytes = new Uint8Array(await blob.slice(0,12).arrayBuffer());
    if (String.fromCharCode(...bytes.slice(4,8)) === "ftyp") return blob.slice(0,blob.size,"video/mp4");
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return blob.slice(0,blob.size,"video/webm");
    throw new Error("播放器未提供可下载的完整视频文件。");
  }
  if (video) {
    try {
      return speechWav(await decodeSpeech(blob));
    } catch (error) {
      if (error instanceof DOMException || error instanceof TypeError)
        throw new Error("视频音轨无法解码，请检查视频是否含声音，并使用播放器可直接读取的完整文件。");
      throw error;
    }
  }
  if (!blob.type || blob.type === "application/octet-stream") {
    const type: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      ogg: "audio/ogg",
      webm: "audio/webm",
    };
    const suffix = new URL(src).pathname.split(".").pop()?.toLowerCase();
    if (suffix && type[suffix]) return blob.slice(0, blob.size, type[suffix]);
  }
  return blob;
}
