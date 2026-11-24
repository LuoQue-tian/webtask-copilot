import { mountWidget } from "../ui/widget";

import { listenInChapter } from "../page/chapter";

if (window !== window.top) listenInChapter(window);
else if (location.origin !== "https://ipub.unipus.cn") mountWidget(document);
