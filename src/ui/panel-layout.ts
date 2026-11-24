declare function GM_getValue<T>(key: string, fallback: T): T;
declare function GM_setValue(key: string, value: unknown): void;
export function enablePanelLayout(panel: HTMLElement, title: HTMLElement) {
  const doc = panel.ownerDocument,
    win = doc.defaultView!;
  const grip = doc.createElement("span");
  grip.className = "size-grip";
  grip.textContent = "⤡";
  grip.title = "拖动调整面板大小";
  title.title = "拖动标题移动面板";
  title.prepend(grip);
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(v, max));
  function place(x: number, y: number, w: number, h: number) {
    const width = clamp(
      w,
      Math.min(210, win.innerWidth - 8),
      win.innerWidth - 8,
    );
    const height = clamp(
      h,
      Math.min(145, win.innerHeight - 8),
      win.innerHeight - 8,
    );
    Object.assign(panel.style, {
      position: "fixed",
      left: clamp(x, 4, win.innerWidth - width - 4) + "px",
      top: clamp(y, 4, win.innerHeight - height - 4) + "px",
      width: width + "px",
      height: height + "px",
      maxHeight: "none",
    });
  }
  title.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const rect = panel.getBoundingClientRect(),
      sx = e.clientX,
      sy = e.clientY,
      resize = e.target === grip;
    const handle = resize ? grip : title;
    handle.setPointerCapture(e.pointerId);
    const move = (event: PointerEvent) => {
      if (event.pointerId !== e.pointerId) return;
      const dx = event.clientX - sx,
        dy = event.clientY - sy;
      if (resize) {
        const x = clamp(
          rect.left + dx,
          4,
          rect.right - Math.min(210, rect.width),
        );
        const y = clamp(
          rect.top + dy,
          4,
          rect.bottom - Math.min(145, rect.height),
        );
        place(x, y, rect.right - x, rect.bottom - y);
      } else place(rect.left + dx, rect.top + dy, rect.width, rect.height);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener(
      "lostpointercapture",
      () => {
        handle.removeEventListener("pointermove", move);
        const { x, y, width, height } = panel.getBoundingClientRect();
        if (typeof GM_setValue === "function")
          GM_setValue("webtask-panel-bounds", [x, y, width, height]);
      },
      { once: true },
    );
    e.preventDefault();
  });
  // 展开后再次校准，覆盖面板收起期间的窗口缩放。
  const fit = () => {
    if (!panel.hidden && panel.style.position === "fixed") {
      const r = panel.getBoundingClientRect();
      place(r.left, r.top, r.width, r.height);
    }
  };
  win.addEventListener("resize", fit);
  const saved =
    typeof GM_getValue === "function"
      ? GM_getValue<number[]>("webtask-panel-bounds", [])
      : [];
  if (
    Array.isArray(saved) &&
    saved.length === 4 &&
    saved.every(Number.isFinite)
  )
    place(saved[0], saved[1], saved[2], saved[3]);
  return fit;
}
