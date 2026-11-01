import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";

import { toExportHtml } from "../lib/export-html";
import { exportContext } from "../lib/export-note";
import { measurePages, type PageEstimate } from "../lib/page-estimate";

const SHOW_KEY = "handy-writer:page-breaks";
/** 입력이 멈춘 뒤 다시 잴 때까지 기다리는 시간 */
const MEASURE_DELAY_MS = 500;

/** A4 쪽 수와 쪽이 넘어가는 자리. 글이 바뀌거나 본문 높이가 바뀌면(그림이 늦게 뜰 때 포함) 다시 잰다. */
export function usePageEstimate(editor: Editor | null, path: string, name: string) {
  const [estimate, setEstimate] = useState<PageEstimate>({ pages: 0, breaks: [] });
  const titleRef = useRef({ path, name });
  titleRef.current = { path, name };
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let run = 0;
    const measure = async () => {
      const id = ++run;
      const { path: notePath, name: title } = titleRef.current;
      const folder = useWorkspaceStore.getState().notes.find((note) => note.path === notePath)?.folder ?? "";
      const body = toExportHtml(editor.getHTML(), await exportContext(editor, folder));
      const next = await measurePages(dom, title, body);
      // 재는 사이에 글이 또 바뀌었으면 늦게 끝난 결과는 버린다.
      if (id === run && !editor.isDestroyed) setEstimate(next);
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!editor.isDestroyed) measure().catch(() => {});
      }, MEASURE_DELAY_MS);
    };
    schedule();
    editor.on("update", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(dom);
    return () => {
      run++;
      if (timer) clearTimeout(timer);
      editor.off("update", schedule);
      observer.disconnect();
    };
  }, [editor]);
  return estimate;
}

function readShow() {
  try {
    return localStorage.getItem(SHOW_KEY) !== "0";
  } catch {
    return true;
  }
}

/** 쪽 나누기 표시를 켤지 (이 컴퓨터에 기억한다, 기본 켜짐) */
export function usePageBreaksShown() {
  const [show, setShow] = useState(readShow);
  const toggle = () =>
    setShow((value) => {
      try {
        localStorage.setItem(SHOW_KEY, value ? "0" : "1");
      } catch {
        // 저장하지 못해도 이번에는 바뀐 대로 보여 준다.
      }
      return !value;
    });
  return [show, toggle] as const;
}

/** 글 왼쪽 여백에 쪽이 넘어가는 자리를 짧은 선과 쪽 번호로 보여 준다. */
export function PageBreakMarkers({ estimate }: { estimate: PageEstimate }) {
  return (
    <>
      {estimate.breaks.map(({ page, y }) => (
        <div
          key={page}
          role="separator"
          aria-label={`A4 ${page}쪽 시작`}
          data-page-break={page}
          className="pointer-events-none absolute -left-11 flex w-9 flex-col items-end"
          style={{ top: y }}
        >
          <span className="w-full border-t border-dashed border-muted-foreground/70" />
          <span className="mt-1 text-[11px] leading-none font-medium text-muted-foreground tabular-nums">{page}쪽</span>
        </div>
      ))}
    </>
  );
}

/** 아래 막대의 `A4 약 3쪽`. 누르면 쪽 나누기 표시를 켜고 끈다. */
export function PageCount({ estimate, shown, onToggle }: { estimate: PageEstimate; shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label="A4 쪽 수"
      aria-pressed={shown}
      title={`A4로 뽑으면 약 ${estimate.pages}쪽이에요 (PDF 내보내기 기준). 누르면 쪽 나누기 표시를 ${shown ? "꺼요" : "켜요"}.`}
      onClick={onToggle}
      className={cn("rounded px-1.5 py-0.5 tabular-nums hover:bg-accent @max-[33rem]:hidden", shown && "text-foreground")}
    >
      A4 약 {estimate.pages}쪽
    </button>
  );
}
