import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

import { textStats } from "../lib/text-stats";

const BLOCK = "\n";

/** 아래 막대의 글자 수. 글을 선택하면 선택한 부분의 글자 수를 보여준다. */
export function TextCount({ editor }: { editor: Editor }) {
  const { total, selected } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { from, to, empty } = e.state.selection;
      return {
        total: textStats(e.state.doc.textBetween(0, e.state.doc.content.size, BLOCK, " ")),
        selected: empty ? null : textStats(e.state.doc.textBetween(from, to, BLOCK, " ")),
      };
    },
  });

  if (total.chars === 0) return <span title="글자 수">0자</span>;
  const title = `공백 제외 ${total.charsNoSpace.toLocaleString()}자 · 읽는 데 약 ${total.readMinutes}분`;
  return (
    <span title={title} aria-label={`글자 수 ${title}`}>
      {selected && selected.chars > 0 ? `선택 ${selected.chars.toLocaleString()}자 / ` : ""}
      {total.chars.toLocaleString()}자 · 약 {total.readMinutes}분
    </span>
  );
}
