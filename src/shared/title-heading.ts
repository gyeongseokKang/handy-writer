import { splitFrontmatter } from "./frontmatter";

/**
 * 본문 맨 앞의 `# 제목`이 글 제목(파일 이름)과 같으면 화면에서는 위쪽 제목이 그 자리를 대신한다.
 * 파일에는 그대로 남아 있으므로(Obsidian 등에서는 보인다), 글 제목을 바꿀 때는 이 줄도 같이 바꿔서 둘이 어긋나지 않게 한다.
 */

export const normalizeTitle = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

export function isTitleHeading(headingText: string, title: string) {
  const want = normalizeTitle(title);
  return want !== "" && normalizeTitle(headingText) === want;
}

const H1 = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/**
 * 글의 첫 줄(frontmatter와 빈 줄 다음)이 `# 옛 제목`이면 `# 새 제목`으로 바꾼 글을 돌려준다.
 * 다른 제목이거나 첫 줄이 제목이 아니면 null (건드리지 않는다).
 */
export function syncTitleHeading(raw: string, oldTitle: string, newTitle: string): string | null {
  const { frontmatter, body } = splitFrontmatter(raw);
  const lines = body.split("\n");
  const index = lines.findIndex((line) => line.trim() !== "");
  if (index === -1) return null;
  const match = H1.exec(lines[index]!.replace(/\r$/, ""));
  if (!match || !isTitleHeading(match[1] ?? "", oldTitle) || isTitleHeading(match[1] ?? "", newTitle)) return null;
  const cr = lines[index]!.endsWith("\r") ? "\r" : "";
  lines[index] = `# ${newTitle.trim()}${cr}`;
  const next = lines.join("\n");
  // splitFrontmatter는 frontmatter 뒤의 빈 줄 하나를 body에서 떼므로 되돌려 붙인다.
  const gap = frontmatter && raw.slice(frontmatter.length).startsWith("\n") ? "\n" : "";
  return `${frontmatter}${gap}${next}`;
}
