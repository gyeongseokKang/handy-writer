import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { Captions, Images, Ungroup } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { isImageRow, joinedLabels, rowEmbeds } from "../lib/image-row";

const button = "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap hover:bg-accent disabled:opacity-40";

/**
 * 나란히 놓은 그림 묶음을 고르면 그 위에 뜨는 막대: 몇 장인지, 나란히 풀기, 그림 라벨로 캡션 채우기.
 * 묶음 안의 그림 하나를 눌러도 묶음 전체가 골라진다 (image-row 플러그인).
 */
export function ImageRowBar({ editor }: { editor: Editor }) {
  const row = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { selection } = e.state;
      if (!(selection instanceof NodeSelection) || !isImageRow(selection.node)) return null;
      const embeds = rowEmbeds(selection.node);
      return { pos: selection.from, count: embeds.length, labels: joinedLabels(embeds) };
    },
    equalityFn: (a, b) => a?.pos === b?.pos && a?.count === b?.count && a?.labels === b?.labels,
  });
  const [, setTick] = useState(0);

  // 스크롤하거나 창 크기가 바뀌면 자리를 다시 잰다.
  useEffect(() => {
    if (!row) return;
    const again = () => setTick((n) => n + 1);
    window.addEventListener("scroll", again, true);
    window.addEventListener("resize", again);
    return () => {
      window.removeEventListener("scroll", again, true);
      window.removeEventListener("resize", again);
    };
  }, [row]);

  if (!row || editor.isDestroyed) return null;
  const dom = editor.view.nodeDOM(row.pos) as HTMLElement | null;
  if (!dom?.getBoundingClientRect) return null;
  const rect = dom.getBoundingClientRect();
  const top = Math.max(8, rect.top - 44);
  const left = rect.left + rect.width / 2;
  const keep = (event: React.MouseEvent) => event.preventDefault();

  return createPortal(
    <div
      role="toolbar"
      aria-label="나란히 놓은 그림"
      style={{ top, left }}
      onMouseDown={keep}
      className="fixed z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-card p-1 text-card-foreground shadow-lg"
    >
      <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground"><Images className="size-3.5" /> 그림 {row.count}장 나란히</span>
      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
      <button type="button" className={button} title="그림을 한 장씩 위아래로 풀어요" onClick={() => editor.chain().focus().splitImageRow(row.pos + 1).run()}>
        <Ungroup className="size-3.5" /> 나란히 풀기
      </button>
      <button
        type="button"
        className={button}
        disabled={!row.labels}
        title={row.labels ? `캡션을 “${row.labels}”로 채워요` : "그림에 라벨이 없어요 (오른쪽 첨부 탭에서 라벨을 달 수 있어요)"}
        onClick={() => editor.chain().focus().fillRowCaption(row.pos + 1).run()}
      >
        <Captions className="size-3.5" /> 라벨로 캡션 채우기
      </button>
    </div>,
    document.body,
  );
}
