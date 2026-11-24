// 共享选择器由 Edge 提供。录制器只接收用户所选标签页的音轨。
export async function recordTabSound(onStart: (stop: () => void) => void): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" }, audio: true,
    selfBrowserSurface: "include", systemAudio: "exclude",
  } as DisplayMediaStreamOptions);
  let timeout: number | undefined;
  try {
    const surface = stream.getVideoTracks()[0];
    if (surface?.getSettings().displaySurface !== "browser")
      throw new Error("请选择教材所在的 Edge 标签页。");
    const tracks = stream.getAudioTracks();
    if (!tracks.length) throw new Error("请选择教材标签页，并勾选「共享标签页音频」。");
    const recorder = new MediaRecorder(new MediaStream(tracks), {mimeType:"audio/webm;codecs=opus"});
    const chunks: Blob[] = [];
    return await new Promise<Blob>((resolve, reject) => {
      const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("标签页声音录制失败，请重试。"));
      recorder.onstop = () => chunks.length
        ? resolve(new Blob(chunks, {type:"audio/webm"}))
        : reject(new Error("没有录到声音，请在录制开始后播放教材视频。"));
      surface.addEventListener("ended", stop, {once:true});
      tracks[0].addEventListener("ended", stop, {once:true});
      recorder.start(1000);
      timeout = window.setTimeout(stop, 599000);
      onStart(stop);
    });
  } finally {
    clearTimeout(timeout);
    stream.getTracks().forEach(track => track.stop());
  }
}
