import type { Extensions } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";

import { AttachmentDrop } from "./attachment-drop";
import { Callout } from "./callout";
import { Embed } from "./embed";
import { SlashCommand } from "./slash-command";
import { SpellCheck, type SpellCheckOptions } from "./spell-check";
import { TagHighlight, type TagHighlightOptions } from "./tag-highlight";
import { WikiLink, type WikiLinkOptions } from "./wiki-link";

export interface EditorCallbacks extends WikiLinkOptions, TagHighlightOptions {
  /** 맞춤법 표시 설정. 없으면 맞춤법 표시를 끈다 (테스트용) */
  spell?: SpellCheckOptions;
  /** false면 임베드를 화면용 컴포넌트 없이 문서로만 다룬다 (테스트용) */
  renderEmbeds?: boolean;
}

export function createExtensions({ onTagClick, renderEmbeds = true, spell, ...wikiLink }: EditorCallbacks): Extensions {
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
    // 임베드(`![[...]]`)는 위키링크(`[[...]]`)보다 먼저 읽어야 앞의 `!`가 글자로 남지 않는다.
    Embed.configure({ renderView: renderEmbeds }),
    WikiLink.configure(wikiLink),
    TagHighlight.configure({ onTagClick }),
    Callout,
    SlashCommand,
    AttachmentDrop,
    ...(spell ? [SpellCheck.configure(spell)] : []),
  ];
}
