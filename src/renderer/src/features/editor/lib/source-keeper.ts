import type { Editor, JSONContent } from "@tiptap/core";

/**
 * 마크다운 원문 보존. 에디터는 저장할 때 글 전체를 다시 쓰므로 손대지 않은 표의 칸 간격이나 주소 표기까지 바뀐다.
 * 그래서 글을 열 때 원문을 맨 위 블록 단위로 나눠 기억해 두고, 저장할 때는 바뀌지 않은 블록은 원문 그대로,
 * 바뀐 블록만 에디터가 새로 쓴다. 다시 읽은 결과가 에디터 내용과 다르면 안전하게 에디터의 전체 출력을 쓴다.
 */

/** 원래 블록 수 × 지금 블록 수가 이보다 크면 보존을 건너뛴다 (아주 긴 글). */
const MAX_COMPARE = 4_000_000;

interface Block {
  /** 블록의 원문 (앞뒤 빈 줄 제외) */
  raw: string;
  start: number;
  end: number;
  /** 이 원문을 읽었을 때 나오는 노드들 (비교용으로 정규화한 JSON) */
  keys: string[];
}

interface Base {
  source: string;
  blocks: Block[];
}

interface MarkdownLike {
  parse: (markdown: string) => JSONContent;
  serialize: (doc: JSONContent) => string;
  instance: { Lexer: new (options: unknown) => { lex: (src: string) => Array<{ type: string; raw: string }> }; defaults: unknown };
}

/** 노드를 비교할 수 있는 문자열로 만든다. 열 때마다 새로 붙는 임시 uid는 뺀다. */
function normalizer(editor: Editor) {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => k !== "uid").map(([k, v]) => [k, strip(v)]));
    }
    return value;
  };
  return (json: JSONContent) => JSON.stringify(strip(editor.schema.nodeFromJSON(json).toJSON()));
}

function buildBase(markdown: MarkdownLike, key: (json: JSONContent) => string, source: string): Base | null {
  const tokens = new markdown.instance.Lexer(markdown.instance.defaults).lex(source);
  if (tokens.map((t) => t.raw).join("") !== source) return null;
  const blocks: Block[] = [];
  let offset = 0;
  for (const token of tokens) {
    const start = offset;
    offset += token.raw.length;
    if (token.type === "space") continue;
    const raw = token.raw.replace(/\n+$/, "");
    const keys = (markdown.parse(raw).content ?? []).map(key);
    if (keys.length === 0) continue;
    blocks.push({ raw, start, end: start + raw.length, keys });
  }
  // 블록마다 따로 읽은 결과를 이어 붙인 것이 글 전체를 읽은 결과와 같아야 블록과 노드를 1:1로 맞출 수 있다.
  const whole = (markdown.parse(source).content ?? []).map(key);
  const pieces = blocks.flatMap((b) => b.keys);
  return whole.length === pieces.length && whole.every((k, i) => k === pieces[i]) ? { source, blocks } : null;
}

/** 두 목록의 가장 긴 공통 부분 (같은 순서로 남은 노드들의 짝) */
function lcs(a: string[], b: string[]): Array<[number, number]> {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

export interface SourceKeeper {
  /** 원문을 기억한다 (글을 열거나 다시 불러오거나 저장한 뒤). */
  setBase: (body: string) => void;
  /** 지금 에디터 내용의 마크다운. 바뀌지 않은 블록은 원문 그대로 쓴다. */
  serialize: () => string;
}

export function createSourceKeeper(editor: Editor): SourceKeeper {
  const markdown = (editor as unknown as { markdown?: MarkdownLike }).markdown;
  const plain = () => editor.getMarkdown();
  if (!markdown) return { setBase: () => {}, serialize: plain };
  const key = normalizer(editor);
  let base: Base | null = null;

  const serialize = () => {
    if (!base) return plain();
    const current = (editor.getJSON().content ?? []).map((node) => ({ node, key: key(node) }));
    // 블록이 아주 많으면 비교 표가 커지므로 에디터의 전체 출력을 쓴다.
    if (base.blocks.length * current.length > MAX_COMPARE) return plain();
    // 원래 노드 하나하나가 어느 블록에서 왔는지
    const origin = base.blocks.flatMap((block, b) => block.keys.map((k, n) => ({ key: k, block: b, index: n })));
    const matchOf = new Map(lcs(origin.map((o) => o.key), current.map((c) => c.key)).map(([o, c]) => [c, o]));
    // 순서가 바뀐(옮긴) 블록은 위 짝짓기에서 빠지므로, 남은 것끼리 내용이 같은 블록을 다시 짝짓는다.
    const used = new Set(matchOf.values());
    const spare = new Map<string, number[]>();
    origin.forEach((o, i) => {
      if (!used.has(i)) spare.set(o.key, [...(spare.get(o.key) ?? []), i]);
    });
    current.forEach((c, i) => {
      if (matchOf.has(i)) return;
      const next = spare.get(c.key)?.shift();
      if (next !== undefined) matchOf.set(i, next);
    });

    type Piece = { text: string; block: number | null };
    const pieces: Piece[] = [];
    let changed: JSONContent[] = [];
    const flushChanged = () => {
      if (changed.length) pieces.push({ text: editor.markdown!.serialize({ type: "doc", content: changed }).replace(/\s+$/, ""), block: null });
      changed = [];
    };
    for (let c = 0; c < current.length; ) {
      const o = matchOf.get(c);
      const from = o === undefined ? undefined : origin[o];
      const block = from === undefined ? undefined : base.blocks[from.block];
      // 블록의 노드가 처음부터 끝까지 그대로 이어서 남아 있어야 원문을 쓴다.
      const whole =
        from && block && from.index === 0 && block.keys.every((_, n) => matchOf.get(c + n) === o! + n);
      if (whole && from && block) {
        flushChanged();
        pieces.push({ text: block.raw, block: from.block });
        c += block.keys.length;
      } else {
        changed.push(current[c]!.node);
        c++;
      }
    }
    flushChanged();

    let out = "";
    pieces.forEach((piece, i) => {
      if (i > 0) {
        const prev = pieces[i - 1]!;
        // 원래도 붙어 있던 두 블록 사이는 원래 빈 줄을 그대로 쓴다.
        out += prev.block !== null && piece.block === prev.block + 1 ? base!.source.slice(base!.blocks[prev.block]!.end, base!.blocks[piece.block]!.start) : "\n\n";
      }
      out += piece.text;
    });

    // 다시 읽어서 에디터 내용과 같은지 확인한다. 다르면 에디터의 전체 출력을 쓴다.
    const check = (markdown.parse(out).content ?? []).map(key);
    const same = check.length === current.length && check.every((k, i) => k === current[i]!.key);
    return same ? out : plain();
  };

  return {
    setBase: (body) => {
      try {
        base = buildBase(markdown, key, body);
      } catch {
        base = null;
      }
    },
    serialize: () => {
      try {
        return serialize();
      } catch {
        return plain();
      }
    },
  };
}
