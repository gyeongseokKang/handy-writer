export interface SplitNote {
  /** 맨 앞의 `---` 블록(구분선과 마지막 줄바꿈 포함). 없으면 빈 문자열 */
  frontmatter: string;
  body: string;
}

const FRONTMATTER = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** frontmatter는 에디터가 망가뜨리므로 본문과 분리해 두었다가 저장할 때 그대로 다시 붙인다. */
export function splitFrontmatter(raw: string): SplitNote {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { frontmatter: "", body: raw };
  const frontmatter = match[0].endsWith("\n") ? match[0] : `${match[0]}\n`;
  return { frontmatter, body: raw.slice(match[0].length).replace(/^\r?\n/, "") };
}

/** 에디터가 만든 마크다운에 frontmatter를 붙여 파일 내용으로 만든다. 본문이 비어 있으면 파일도 비어 있다. */
export function serializeNote(frontmatter: string, markdown: string) {
  const body = markdown.replace(/\s+$/, "");
  if (!body) return frontmatter;
  return frontmatter ? `${frontmatter}\n${body}\n` : `${body}\n`;
}
