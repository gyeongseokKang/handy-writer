import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";

import type { DocBlock, DocInline, DocModel } from "../shared/docx-model";

export type DocxImageType = "png" | "jpg" | "gif" | "bmp";

/** 그림 주소에서 파일 내용을 읽는다. 못 읽거나 Word가 못 넣는 형식이면 null */
export type ImageLoader = (src: string) => Promise<{ data: Uint8Array; type: DocxImageType } | null>;

const FONT = "Malgun Gothic";
const CODE_FONT = "Consolas";
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

/** 파일 앞부분으로 Word가 받는 그림 형식을 알아낸다. */
export function imageTypeOf(data: Uint8Array): DocxImageType | null {
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
  if (data[0] === 0xff && data[1] === 0xd8) return "jpg";
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "gif";
  if (data[0] === 0x42 && data[1] === 0x4d) return "bmp";
  return null;
}

async function runs(items: DocInline[], images: Map<string, Awaited<ReturnType<ImageLoader>>>, base: { font?: string; bold?: boolean } = {}) {
  const out: ParagraphChild[] = [];
  for (const item of items) {
    if (item.type === "break") out.push(new TextRun({ break: 1 }));
    else if (item.type === "footnote") out.push(new FootnoteReferenceRun(item.id));
    else if (item.type === "image") {
      const file = images.get(item.src);
      if (file && item.width > 0 && item.height > 0) {
        out.push(new ImageRun({ type: file.type, data: file.data, transformation: { width: item.width, height: item.height }, altText: { name: item.alt || "그림", description: item.alt, title: item.alt } }));
      } else {
        out.push(new TextRun({ text: `[그림${item.alt ? `: ${item.alt}` : ""}]`, italics: true, color: "57606A" }));
      }
    } else {
      const run = new TextRun({
        text: item.text,
        bold: item.bold || base.bold,
        italics: item.italic,
        strike: item.strike,
        font: item.code ? CODE_FONT : base.font,
        ...(item.code ? { shading: { type: ShadingType.CLEAR, fill: "F3F4F6", color: "auto" } } : {}),
        ...(item.link ? { style: "Hyperlink" } : {}),
      });
      out.push(item.link ? new ExternalHyperlink({ link: item.link, children: [run] }) : run);
    }
  }
  return out;
}

/** 인용·콜아웃 안의 문단: 깊이만큼 들여 쓰고 왼쪽에 선을 긋는다. */
function quoteProps(quote = 0) {
  if (!quote) return {};
  return {
    indent: { left: 360 * quote },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: "D0D7DE", space: 8 } },
  };
}

async function blockToDocx(block: DocBlock, images: Map<string, Awaited<ReturnType<ImageLoader>>>): Promise<(Paragraph | Table)[]> {
  switch (block.type) {
    case "heading":
      return [new Paragraph({ heading: HEADINGS[block.level - 1], children: await runs(block.children, images) })];
    case "paragraph":
      return [
        new Paragraph({
          children: await runs(block.children, images, block.role === "callout-title" ? { bold: true } : {}),
          ...(block.role === "caption" ? { alignment: AlignmentType.CENTER } : {}),
          ...quoteProps(block.quote),
        }),
      ];
    case "list-item": {
      const box = block.checked === null ? [] : [new TextRun({ text: block.checked ? "☑ " : "☐ " })];
      const level = Math.min(block.level, 8);
      return [
        new Paragraph({
          children: [...box, ...(await runs(block.children, images))],
          ...(block.ordered !== null
            ? { numbering: { reference: "ordered", level, instance: block.ordered } }
            : block.checked === null
              ? { bullet: { level } }
              : { indent: { left: 360 * (level + 1) } }),
        }),
      ];
    }
    case "code":
      return block.text.split("\n").map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line || " ", font: CODE_FONT, size: 19 })],
            shading: { type: ShadingType.CLEAR, fill: "F6F8FA", color: "auto" },
            spacing: { before: 0, after: 0 },
            ...quoteProps(block.quote),
          }),
      );
    case "rule":
      return [new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D0D7DE", space: 1 } } })];
    case "table": {
      if (block.rows.length === 0) return [];
      const columns = Math.max(...block.rows.map((row) => row.cells.length));
      const rows = await Promise.all(
        block.rows.map(
          async (row) =>
            new TableRow({
              tableHeader: row.header,
              children: await Promise.all(
                Array.from({ length: columns }, async (_v, i) =>
                  new TableCell({
                    children: [new Paragraph({ children: await runs(row.cells[i] ?? [], images, row.header ? { bold: true } : {}) })],
                    ...(row.header ? { shading: { type: ShadingType.CLEAR, fill: "F6F8FA", color: "auto" } } : {}),
                  }),
                ),
              ),
            }),
        ),
      );
      // 표 뒤에 빈 문단이 없으면 Word에서 바로 다음 표와 붙어 버린다.
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }), new Paragraph({ children: [] })];
    }
  }
}

function collectImages(model: DocModel) {
  const sources = new Set<string>();
  const visit = (items: DocInline[]) => items.forEach((item) => item.type === "image" && sources.add(item.src));
  for (const block of model.blocks) {
    if (block.type === "table") block.rows.forEach((row) => row.cells.forEach(visit));
    else if ("children" in block) visit(block.children);
  }
  Object.values(model.footnotes).forEach(visit);
  return [...sources];
}

/** 글 모양(DocModel)으로 .docx 파일 내용을 만든다. 그림은 load로 읽어 파일 안에 넣는다. */
export async function buildDocx(model: DocModel, load: ImageLoader): Promise<Buffer> {
  const sources = collectImages(model);
  const images = new Map(await Promise.all(sources.map(async (src) => [src, await load(src).catch(() => null)] as const)));

  const children: (Paragraph | Table)[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(model.title)] })];
  for (const block of model.blocks) children.push(...(await blockToDocx(block, images)));

  const footnotes: Record<string, { children: Paragraph[] }> = {};
  for (const [id, items] of Object.entries(model.footnotes)) {
    footnotes[id] = { children: [new Paragraph({ children: await runs(items, images) })] };
  }

  const document = new Document({
    title: model.title,
    creator: "Handy Writer",
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 120, line: 300 } } },
        title: { run: { font: FONT, size: 44, bold: true } },
        heading1: { run: { font: FONT, size: 36, bold: true, color: "1F2328" }, paragraph: { spacing: { before: 360, after: 120 } } },
        heading2: { run: { font: FONT, size: 30, bold: true, color: "1F2328" }, paragraph: { spacing: { before: 300, after: 120 } } },
        heading3: { run: { font: FONT, size: 26, bold: true, color: "1F2328" }, paragraph: { spacing: { before: 240, after: 80 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: "ordered",
          levels: Array.from({ length: 9 }, (_v, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
          })),
        },
      ],
    },
    footnotes,
    sections: [{ children }],
  });
  return Packer.toBuffer(document);
}
