import { isMap, isScalar, isSeq, parseDocument, stringify, type Document } from "yaml";

/** 속성 편집기에 보여 줄 frontmatter 항목 하나 */
export interface FrontmatterProp {
  key: string;
  /** text: 글자·숫자·날짜, list: 목록, bool: 예/아니오, other: 표로 고치기 어려운 값(읽기만) */
  kind: "text" | "list" | "bool" | "other";
  /** text는 그 값, list는 쉼표로 이은 값, other는 YAML 그대로 */
  value: string;
}

const inner = (frontmatter: string) => frontmatter.replace(/^---[ \t]*\r?\n/, "").replace(/(?:\r?\n)?---[ \t]*\r?\n?$/, "");

function read(frontmatter: string): Document {
  const doc = parseDocument(inner(frontmatter));
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) throw new Error("frontmatter를 읽을 수 없어요.");
  return doc;
}

function write(doc: Document) {
  if (!isMap(doc.contents) || doc.contents.items.length === 0) return "";
  return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}---\n`;
}

/** frontmatter의 항목을 순서대로 읽는다. YAML로 읽을 수 없으면 null */
export function listProps(frontmatter: string): FrontmatterProp[] | null {
  if (!frontmatter.trim()) return [];
  let doc: Document;
  try {
    doc = read(frontmatter);
  } catch {
    return null;
  }
  if (!isMap(doc.contents)) return [];
  return doc.contents.items.map((pair) => {
    const key = String(isScalar(pair.key) ? pair.key.value : pair.key);
    const node = pair.value;
    if (isScalar(node) || node === null) {
      const value = isScalar(node) ? node.value : null;
      if (typeof value === "boolean") return { key, kind: "bool", value: String(value) };
      if (value === null) return { key, kind: "text", value: "" };
      if (value instanceof Date) return { key, kind: "text", value: value.toISOString().slice(0, 10) };
      return { key, kind: "text", value: String(value) };
    }
    if (isSeq(node) && node.items.every((item) => isScalar(item))) {
      return { key, kind: "list", value: node.items.map((item) => String(isScalar(item) ? item.value : "")).join(", ") };
    }
    return { key, kind: "other", value: stringify(node, { lineWidth: 0 }).trimEnd() };
  });
}

/**
 * 항목 하나의 값을 바꾸거나 새로 넣는다. 다른 항목과 주석, 순서는 그대로 둔다.
 * list는 쉼표로 나눠 목록으로, text는 원래 숫자였고 숫자를 넣었으면 숫자로 쓴다.
 */
export function setProp(frontmatter: string, key: string, value: string, kind: FrontmatterProp["kind"] = "text"): string {
  const name = key.trim();
  if (!name) throw new Error("속성 이름을 적어 주세요.");
  const doc = read(frontmatter);
  if (doc.contents === null) doc.contents = doc.createNode({}) as never;
  let next: unknown;
  if (kind === "list") {
    const items = value.split(",").map((part) => part.trim()).filter(Boolean);
    const current = doc.get(name, true);
    // `[a, b]` 같은 한 줄 목록 모양을 지키려고 원래 목록의 항목만 바꾼다.
    if (isSeq(current)) {
      current.items = items.map((item) => doc.createNode(item));
      return write(doc);
    }
    next = doc.createNode(items);
  } else if (kind === "bool") next = value === "true";
  else {
    const before = doc.get(name);
    const trimmed = value.trim();
    next = typeof before === "number" && trimmed !== "" && Number.isFinite(Number(trimmed)) ? Number(trimmed) : value;
    const current = doc.get(name, true);
    // 따옴표 모양 같은 원래 표기를 지키려고 글자 항목은 값만 바꾼다.
    if (isScalar(current) && typeof next === "string" && typeof current.value === "string") {
      current.value = next;
      return write(doc);
    }
  }
  doc.set(name, next);
  return write(doc);
}

/** 항목을 지운다. 남은 항목이 없으면 frontmatter도 없앤다. */
export function removeProp(frontmatter: string, key: string): string {
  if (!frontmatter.trim()) return frontmatter;
  const doc = read(frontmatter);
  doc.delete(key);
  return write(doc);
}

/** 항목 이름을 바꾼다. 자리와 값은 그대로 둔다. */
export function renameProp(frontmatter: string, from: string, to: string): string {
  const name = to.trim();
  if (!name || name === from) return frontmatter;
  const doc = read(frontmatter);
  if (!isMap(doc.contents)) return frontmatter;
  if (doc.has(name)) throw new Error(`‘${name}’ 속성이 이미 있어요.`);
  const pair = doc.contents.items.find((item) => String(isScalar(item.key) ? item.key.value : item.key) === from);
  if (!pair) return frontmatter;
  pair.key = doc.createNode(name) as never;
  return write(doc);
}
