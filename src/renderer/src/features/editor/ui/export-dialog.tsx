import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { DEFAULT_PAGE_OPTIONS, normalizePageOptions, PAGE_LIMITS, PAPERS, type PageNumbers, type PageOptions, type PaperName } from "@shared/export";

import { contentSize, layoutDocument, pageMarkup, type DocumentPages } from "../lib/page-estimate";

const STORAGE_KEY = "handy-writer:export-layout";
const MM = 96 / 25.4;
/** 미리보기에서 한 쪽을 보여 줄 가로 폭 (px) */
const PREVIEW_WIDTH = 340;
/** 미리보기에 그릴 쪽 수 (더 많으면 앞쪽만 보여 준다) */
const MAX_PREVIEW_PAGES = 10;

export function loadPageOptions(): PageOptions {
  try {
    return normalizePageOptions(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_PAGE_OPTIONS;
  }
}

function savePageOptions(options: PageOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // 기억하지 못해도 이번 내보내기에는 영향이 없다.
  }
}

/** 글자를 지우고 다시 쓰는 중간 값도 받아 주고, 범위 안의 숫자일 때만 설정에 반영한다. */
function NumberField({ label, unit, value, min, max, step, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          aria-label={label}
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            setText(event.target.value);
            const n = Number(event.target.value);
            if (event.target.value !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n);
          }}
          onBlur={() => setText(String(value))}
          className="h-8 w-20 rounded-md border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <span className="w-6 text-xs text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}

/** 쪽 하나를 shadow DOM에 그린다. 앱 화면의 스타일과 섞이지 않고, 글이 시작하는 높이만큼 위로 올려 그 쪽 몫만 보여 준다. */
function PageBody({ markup, from, height, width }: { markup: string; from: number; height: number; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    (host.shadowRoot ?? host.attachShadow({ mode: "open" })).innerHTML = markup;
  }, [markup]);
  return (
    <div style={{ width, height, overflow: "hidden" }}>
      <div ref={ref} style={{ width, transform: `translateY(${-from}px)` }} />
    </div>
  );
}

function Sheet({ page, pages, starts, markup, options }: { page: number; pages: number; starts: number[]; markup: string; options: PageOptions }) {
  const paper = PAPERS[options.paper];
  const content = contentSize(options);
  const from = starts[page - 1] ?? 0;
  const to = starts[page] ?? Number.POSITIVE_INFINITY;
  const height = Math.min(content.height, to - from);
  const scale = PREVIEW_WIDTH / (paper.width * MM);
  return (
    // zoom으로 실제 크기 그대로 그린 쪽을 줄여 보여 준다.
    <div data-preview-page={page} style={{ zoom: scale }} className="relative shrink-0 bg-white shadow-md ring-1 ring-black/10">
      <div style={{ width: paper.width * MM, height: paper.height * MM }} className="relative">
        <div style={{ position: "absolute", left: options.marginX * MM, top: options.marginY * MM }}>
          <PageBody markup={markup} from={from} height={height} width={content.width} />
        </div>
        {options.pageNumbers !== "none" && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(4, options.marginY * MM * 0.35), textAlign: "center", fontSize: 12, color: "#6b7280" }}>
            {page}
            {options.pageNumbers === "of-total" && ` / ${pages}`}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ExportDialogProps {
  format: "pdf" | "docx";
  title: string;
  /** 내보내기용 본문 HTML (제목 줄은 뺀 것) */
  html: string;
  onClose: () => void;
  onExport: (options: PageOptions) => void;
}

/**
 * PDF·Word로 내보내기 전에 글자 크기, 여백, 종이, 쪽 번호를 고르고 쪽마다 어떻게 나오는지 미리 보는 창.
 * 고른 값은 이 컴퓨터에 기억해서 다음에도 그대로 쓴다.
 */
export function ExportDialog({ format, title, html, onClose, onExport }: ExportDialogProps) {
  const [options, setOptions] = useState(loadPageOptions);
  const set = <K extends keyof PageOptions>(key: K, value: PageOptions[K]) => setOptions((current) => normalizePageOptions({ ...current, [key]: value }));
  const [layout, setLayout] = useState<DocumentPages | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const label = format === "pdf" ? "PDF" : "Word";

  useEffect(() => dialogRef.current?.focus(), []);

  // 설정이 바뀌면 잠깐 뒤에 문서를 다시 그려서 쪽 나눔을 구한다. 늦게 끝난 결과는 버린다.
  useEffect(() => {
    let stale = false;
    const timer = setTimeout(() => {
      layoutDocument(title, html, options)
        .then((result) => !stale && setLayout(result))
        .catch(() => {});
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [title, html, options]);

  const markup = useMemo(() => pageMarkup(title, html, options), [title, html, options]);
  const shown = layout ? Math.min(layout.pages, MAX_PREVIEW_PAGES) : 0;
  const { fontPt, lineHeight, margin } = PAGE_LIMITS;

  // 아래 막대의 컨테이너 안에 그리면 고정 위치가 그 칸 기준이 되므로 body에 그린다.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${label}로 내보내기`}
        tabIndex={-1}
        className="flex h-[88vh] w-full max-w-4xl overflow-hidden rounded-xl border bg-card text-sm shadow-2xl outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <div className="flex w-80 shrink-0 flex-col border-r">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-base font-semibold">{label}로 내보내기</h2>
            <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
              <X className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="flex items-center justify-between gap-3">
              <span>종이</span>
              <select
                aria-label="종이"
                value={options.paper}
                onChange={(event) => set("paper", event.target.value as PaperName)}
                className="h-8 w-32 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {(Object.keys(PAPERS) as PaperName[]).map((name) => (
                  <option key={name} value={name}>
                    {PAPERS[name].label} ({PAPERS[name].width}×{PAPERS[name].height}mm)
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="글자 크기" unit="pt" value={options.fontPt} {...fontPt} onChange={(v) => set("fontPt", v)} />
            <NumberField label="줄 간격" unit="배" value={options.lineHeight} {...lineHeight} onChange={(v) => set("lineHeight", v)} />
            <NumberField label="좌우 여백" unit="mm" value={options.marginX} {...margin} onChange={(v) => set("marginX", v)} />
            <NumberField label="위아래 여백" unit="mm" value={options.marginY} {...margin} onChange={(v) => set("marginY", v)} />
            <label className="flex items-center justify-between gap-3">
              <span>쪽 번호</span>
              <select
                aria-label="쪽 번호"
                value={options.pageNumbers}
                onChange={(event) => set("pageNumbers", event.target.value as PageNumbers)}
                className="h-8 w-32 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="none">넣지 않음</option>
                <option value="number">1, 2, 3…</option>
                <option value="of-total">1 / 전체 쪽 수</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={options.showTitle} onChange={(event) => set("showTitle", event.target.checked)} className="size-4 accent-primary" />
              <span>맨 위에 글 제목 넣기</span>
            </label>
            <button type="button" onClick={() => setOptions(DEFAULT_PAGE_OPTIONS)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              기본값으로 되돌리기
            </button>
            {format === "docx" && <p className="text-xs leading-5 text-muted-foreground">미리보기는 PDF 기준이에요. Word에서는 글꼴이 달라서 쪽이 나뉘는 자리가 조금 다를 수 있어요.</p>}
          </div>
          <footer className="flex items-center justify-between gap-2 border-t px-5 py-3">
            <span aria-live="polite" data-testid="export-page-count" className="text-xs text-muted-foreground tabular-nums">
              {layout ? `약 ${layout.pages}쪽` : "계산하는 중…"}
            </span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  savePageOptions(options);
                  onExport(options);
                }}
              >
                내보내기
              </Button>
            </span>
          </footer>
        </div>

        <div aria-label="미리보기" className="min-w-0 flex-1 overflow-y-auto bg-muted/50 p-5">
          <div className="mx-auto flex flex-col items-center gap-4" style={{ width: PREVIEW_WIDTH }}>
            {Array.from({ length: shown }, (_v, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <Sheet page={i + 1} pages={layout?.pages ?? 1} starts={layout?.starts ?? [0]} markup={markup} options={options} />
                <span className="text-xs text-muted-foreground tabular-nums">{i + 1}쪽</span>
              </div>
            ))}
            {layout && layout.pages > shown && <p className={cn("pb-2 text-xs text-muted-foreground")}>미리보기는 앞의 {shown}쪽까지만 보여 줘요. (전체 {layout.pages}쪽)</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
