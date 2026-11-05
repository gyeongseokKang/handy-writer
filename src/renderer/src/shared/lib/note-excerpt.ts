import { splitFrontmatter } from "@shared/frontmatter";

/**
 * 미리보기용 짧은 글: frontmatter·코드 블록·HTML 주석을 빼고, 마크다운 기호를 걷어 낸 줄들.
 * 제목 줄은 heading으로 표시하고, 이미지·첨부는 [그림]으로, [[링크|별칭]]은 별칭(없으면 이름)으로 둔다.
 */
export function noteExcerpt(raw: string, maxChars = 360): { lines: { text: string; heading: boolean }[]; truncated: boolean } {
  const body = splitFrontmatter(raw).body.replace(/<!--[\s\S]*?-->/g, "").replace(/^```[\s\S]*?^```/gm, "");
  const lines: { text: string; heading: boolean }[] = [];
  let used = 0;
  let truncated = false;
  for (const rawLine of body.split("\n")) {
    const heading = /^#{1,6}\s/.test(rawLine);
    const text = rawLine
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\s*>\s?(\[![^\]]*\][+-]?\s*)?/, "")
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "• ")
      .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, "[그림]")
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, name: string, alias?: string) => alias ?? name)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__|~~|`)/g, "")
      .replace(/\s*\^[\w-]+$/, "")
      .trim();
    if (!text || /^[-*_]{3,}$/.test(text)) continue;
    if (used + text.length > maxChars) {
      lines.push({ text: `${text.slice(0, Math.max(0, maxChars - used))}…`, heading });
      truncated = true;
      break;
    }
    lines.push({ text, heading });
    used += text.length;
  }
  return { lines, truncated };
}
