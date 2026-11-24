// hashchange/popstate cover browser navigation; some routers only change history.
export function watchPage(doc: Document, refresh: () => void): () => void {
  const win = doc.defaultView!;
  let lastUrl = doc.URL;
  const update = () => {
    lastUrl = doc.URL;
    refresh();
  };
  const observer = new win.MutationObserver(update);
  observer.observe(doc, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-preview-page"],
  });
  win.addEventListener("popstate", update);
  win.addEventListener("hashchange", update);
  const timer = win.setInterval(() => {
    if (lastUrl !== doc.URL) update();
  }, 350);
  update();
  return () => {
    observer.disconnect();
    win.clearInterval(timer);
    win.removeEventListener("popstate", update);
    win.removeEventListener("hashchange", update);
  };
}
