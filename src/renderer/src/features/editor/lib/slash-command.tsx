import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Info,
  LayoutTemplate,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Table2,
} from "lucide-react";

import { attachFromDialog } from "@/entities/note/model/attach-files";
import { useTemplateDialogStore } from "@/entities/template/model/use-template-dialog-store";
import { useTemplateStore } from "@/entities/template/model/use-template-store";

import { createSuggestionRender, type SuggestionItem } from "./suggestion-render";

type Run = (editor: Editor, range: Range) => void;

interface SlashEntry {
  title: string;
  description: string;
  keywords: string[];
  icon: SuggestionItem<Run>["icon"];
  run: Run;
}

const ENTRIES: SlashEntry[] = [
  {
    title: "텍스트",
    description: "일반 문단",
    keywords: ["text", "paragraph", "문단", "본문"],
    icon: <Pilcrow className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "제목 1",
    description: "큰 제목",
    keywords: ["h1", "heading", "제목"],
    icon: <Heading1 className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "제목 2",
    description: "중간 제목",
    keywords: ["h2", "heading", "제목"],
    icon: <Heading2 className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "제목 3",
    description: "작은 제목",
    keywords: ["h3", "heading", "제목"],
    icon: <Heading3 className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "글머리 기호 목록",
    description: "순서 없는 목록",
    keywords: ["bullet", "list", "ul", "목록", "리스트"],
    icon: <List className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "번호 목록",
    description: "순서 있는 목록",
    keywords: ["number", "ordered", "ol", "목록", "리스트"],
    icon: <ListOrdered className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "할 일 목록",
    description: "체크박스 목록",
    keywords: ["todo", "task", "check", "체크", "할일"],
    icon: <ListChecks className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "인용",
    description: "인용문 블록",
    keywords: ["quote", "blockquote", "인용"],
    icon: <Quote className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "콜아웃",
    description: "강조 상자 (Obsidian 호환)",
    keywords: ["callout", "note", "tip", "admonition", "강조", "노트"],
    icon: <Info className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertCallout("note").run(),
  },
  {
    title: "코드 블록",
    description: "코드를 입력해요",
    keywords: ["code", "codeblock", "코드"],
    icon: <Code2 className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "이미지·영상·파일",
    description: "파일을 골라 첨부해요",
    keywords: ["image", "img", "video", "file", "attach", "photo", "pdf", "이미지", "사진", "영상", "첨부", "파일"],
    icon: <ImagePlus className="size-4" />,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      void attachFromDialog();
    },
  },
  {
    title: "구분선",
    description: "가로 줄",
    keywords: ["divider", "hr", "rule", "line", "구분"],
    icon: <Minus className="size-4" />,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "표",
    description: "3×3 표",
    keywords: ["table", "표"],
    icon: <Table2 className="size-4" />,
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

/** 저장된 템플릿을 슬래시 메뉴 항목으로 만든다. 고르면 입력 창이 열린다. */
function templateEntries(): SlashEntry[] {
  return useTemplateStore.getState().templates.map((template) => ({
    title: template.name,
    description: `템플릿 블록${template.description ? ` · ${template.description}` : ""}`,
    keywords: [template.id.toLowerCase(), "template", "템플릿", "블록"],
    icon: <LayoutTemplate className="size-4" />,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      useTemplateDialogStore.getState().openNew(template.id);
    },
  }));
}

export function filterSlashEntries(query: string, extra: SlashEntry[] = []) {
  const all = [...ENTRIES, ...extra];
  const needle = query.trim().toLowerCase();
  if (!needle) return all;
  return all.filter(
    (entry) => entry.title.toLowerCase().includes(needle) || entry.keywords.some((keyword) => keyword.includes(needle)),
  );
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SuggestionItem<Run>, SuggestionItem<Run>>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommandSuggestion"),
        char: "/",
        // 템플릿 이름에는 공백이 있다(더 알아보기). 다만 `/ 구분`처럼 슬래시 바로 뒤에 공백이 오면 메뉴가 아니라 일반 글이다.
        allowSpaces: true,
        allow: ({ state, range }) =>
          !state.selection.$from.parent.type.spec.code && !/^\/\s/.test(state.doc.textBetween(range.from, range.to, "\n", "\uFFFC")),
        items: ({ query }) =>
          filterSlashEntries(query, templateEntries()).map((entry) => ({
            id: `${entry.title}:${entry.description}`,
            title: entry.title,
            description: entry.description,
            icon: entry.icon,
            payload: entry.run,
          })),
        command: ({ editor, range, props }) => props.payload(editor, range),
        render: createSuggestionRender<Run>(),
      }),
    ];
  },
});
