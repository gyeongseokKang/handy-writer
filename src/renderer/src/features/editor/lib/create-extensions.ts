import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";

import { Callout } from "./callout";
import { SlashCommand } from "./slash-command";
import { WikiLink, type WikiLinkOptions } from "./wiki-link";

export function createExtensions(wikiLink: WikiLinkOptions): Extensions {
  return [
    StarterKit.configure({
      // 밑줄은 마크다운에 없는 서식이라 쓰지 않는다.
      underline: false,
      link: { openOnClick: false, autolink: true },
    }),
    Markdown,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "heading" ? "제목" : "내용을 입력하세요. /로 블록을, [[로 다른 글을 연결해요",
    }),
    WikiLink.configure(wikiLink),
    Callout,
    SlashCommand,
  ];
}
