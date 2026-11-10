import { listProps, removeProp, setProp } from "./frontmatter-props";

/** 글 한 편에만 적용하는 퇴고 룰을 담는 속성 이름 (글과 함께 git으로 관리된다) */
export const NOTE_REVISE_KEY = "revise_rules";

/** 이 글의 퇴고 룰. 없거나 frontmatter를 읽을 수 없으면 빈 글 */
export function readNoteReviseRules(frontmatter: string): string {
  const prop = listProps(frontmatter)?.find((p) => p.key === NOTE_REVISE_KEY);
  return prop && prop.kind === "text" ? prop.value : "";
}

/** 이 글의 퇴고 룰을 적는다. 비우면 속성을 지운다. */
export function writeNoteReviseRules(frontmatter: string, rules: string): string {
  const clean = rules.replace(/\s+$/, "");
  if (!clean.trim()) return listProps(frontmatter)?.some((p) => p.key === NOTE_REVISE_KEY) ? removeProp(frontmatter, NOTE_REVISE_KEY) : frontmatter;
  return setProp(frontmatter, NOTE_REVISE_KEY, clean);
}
