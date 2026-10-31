const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** 소제목 글자를 견줄 수 있게 다듬는다 (서식 기호와 대소문자, 공백 차이를 무시). */
function normalize(text: string) {
  return text.replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** `글 이름#소제목`을 글 이름과 소제목으로 나눈다. 소제목이 없으면 null */
export function splitEmbedTarget(target: string): { name: string; heading: string | null } {
  const index = target.indexOf("#");
  if (index === -1) return { name: target.trim(), heading: null };
  const heading = target.slice(index + 1).trim();
  return { name: target.slice(0, index).trim(), heading: heading || null };
}

/**
 * 본문에서 그 소제목의 절(소제목 줄부터 같거나 높은 단계의 다음 소제목 전까지)을 꺼낸다.
 * 코드 블록 안의 `#` 줄은 소제목으로 보지 않는다. 찾지 못하면 null
 */
export function extractSection(markdown: string, heading: string): string | null {
  const want = normalize(heading);
  const lines = markdown.split(/\r?\n/);
  let fence: string | null = null;
  let start = -1;
  let level = 0;
  for (const [i, line] of lines.entries()) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const mark = fenceMatch[1] ?? "";
      if (fence === null) fence = mark[0] ?? null;
      else if (mark[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = HEADING.exec(line);
    if (!match) continue;
    const depth = (match[1] ?? "").length;
    if (start === -1) {
      if (normalize(match[2] ?? "") === want) {
        start = i;
        level = depth;
      }
    } else if (depth <= level) {
      return lines.slice(start, i).join("\n").trimEnd();
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n").trimEnd();
}
