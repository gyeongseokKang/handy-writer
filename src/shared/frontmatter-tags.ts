import { isMap, isSeq, parseDocument, YAMLSeq } from "yaml";

/**
 * frontmatter의 `tags`에 태그를 더한다. 다른 값과 주석, `[a, b]` 같은 한 줄 목록 모양은 그대로 둔다.
 * frontmatter가 없으면 새로 만든다. 이미 있는 태그(대소문자 무시)는 다시 넣지 않는다.
 */
export function addFrontmatterTags(frontmatter: string, tags: string[]): string {
  const clean = tags.map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
  if (clean.length === 0) return frontmatter;
  if (!frontmatter.trim()) return `---\ntags:\n${clean.map((t) => `  - ${t}`).join("\n")}\n---\n`;

  const inner = frontmatter.replace(/^---[ \t]*\r?\n/, "").replace(/(?:\r?\n)?---[ \t]*\r?\n?$/, "");
  const doc = parseDocument(inner);
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) {
    throw new Error("frontmatter를 읽을 수 없어서 태그를 넣지 못했어요.");
  }
  const current = doc.get("tags", true);
  let seq: YAMLSeq;
  if (isSeq(current)) {
    seq = current;
  } else {
    // 없거나 "a b" 같은 글자로 적힌 태그는 목록으로 바꾼다.
    const existing = typeof doc.get("tags") === "string" ? String(doc.get("tags")).split(/[,\s]+/).filter(Boolean) : [];
    seq = doc.createNode(existing) as YAMLSeq;
    doc.set("tags", seq);
  }
  const have = new Set(seq.items.map((item) => String((item as { value?: unknown }).value ?? item).toLowerCase()));
  for (const tag of clean) {
    if (have.has(tag.toLowerCase())) continue;
    seq.add(doc.createNode(tag));
    have.add(tag.toLowerCase());
  }
  return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}---\n`;
}
