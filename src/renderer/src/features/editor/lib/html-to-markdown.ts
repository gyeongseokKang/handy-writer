import { Editor } from "@tiptap/core";

import { createExtensions } from "./create-extensions";

/** 가져오지 않는 요소 (스크립트, 광고 틀, 입력 양식 등) */
const DROP = "script, style, noscript, iframe, object, embed, svg, canvas, form, button, input, select, textarea, template";

/**
 * 웹 페이지 본문 HTML을 이 앱의 마크다운으로 바꾼다. 에디터가 아는 요소만 남으므로 그 자체로 정리(살균)된다.
 * 그림은 원래 주소를 가리키는 임베드(`![설명](주소)`)로 남긴다.
 */
export function htmlToMarkdown(html: string, baseUrl?: string) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.body.querySelectorAll(DROP).forEach((el) => el.remove());

  const absolute = (src: string) => {
    try {
      return new URL(src, baseUrl).toString();
    } catch {
      return "";
    }
  };
  for (const img of doc.body.querySelectorAll("img")) {
    const src = absolute(img.getAttribute("src") ?? img.getAttribute("data-src") ?? "");
    if (!/^https?:/i.test(src)) {
      img.remove();
      continue;
    }
    const embed = doc.createElement("span");
    embed.setAttribute("data-embed", src);
    embed.setAttribute("data-syntax", "markdown");
    embed.setAttribute("data-label", (img.getAttribute("alt") ?? "").replace(/[\[\]|]/g, " ").trim());
    // 문단 밖에 홀로 있는 그림은 문단으로 감싸야 에디터가 읽는다.
    const inline = img.closest("p, li, td, th, h1, h2, h3, h4, h5, h6, figcaption");
    if (inline) img.replaceWith(embed);
    else {
      const p = doc.createElement("p");
      p.append(embed);
      img.replaceWith(p);
    }
  }
  // 그림 설명은 기울임 문단으로
  for (const caption of doc.body.querySelectorAll("figcaption")) {
    const p = doc.createElement("p");
    const em = doc.createElement("em");
    em.textContent = caption.textContent?.trim() ?? "";
    p.append(em);
    caption.replaceWith(p);
  }
  for (const a of doc.body.querySelectorAll("a[href]")) {
    const href = absolute(a.getAttribute("href") ?? "");
    if (/^https?:/i.test(href)) a.setAttribute("href", href);
    else a.replaceWith(...a.childNodes);
  }

  const editor = new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
    content: doc.body.innerHTML,
  });
  try {
    return editor.getMarkdown().replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    editor.destroy();
  }
}
