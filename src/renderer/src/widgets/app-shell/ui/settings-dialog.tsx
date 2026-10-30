import { FolderOpen, Settings, X } from "lucide-react";
import type { ReactNode } from "react";

import { useSpellStore } from "@/entities/note/model/use-spell-store";
import { DEFAULT_EDITOR_WIDTH, MAX_EDITOR_WIDTH, MIN_EDITOR_WIDTH, useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { shortcutLabel } from "@/shared/lib/shortcut";
import { Button } from "@/shared/ui/button";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/** 여기저기 흩어진 설정을 한곳에 모은 창 (Cmd/Ctrl+,). 자세한 설정은 각 화면으로 이어 준다. */
export function SettingsDialog() {
  const ui = useUiStore();
  const close = () => ui.setSettingsOpen(false);
  const go = (run: () => void) => () => {
    close();
    run();
  };
  const root = useWorkspaceStore((s) => s.root);
  const spell = useSpellStore();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[6vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        tabIndex={-1}
        ref={(el) => el?.focus()}
        className="w-full max-w-lg space-y-4 rounded-xl border bg-card px-6 py-5 text-sm shadow-2xl outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Settings className="size-4" /> 설정
          </h2>
          <button type="button" aria-label="닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        <Section title="작업 폴더">
          <div className="flex items-center gap-2">
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={root ?? ""}>
              {root}
            </span>
            <Button size="sm" variant="outline" className="h-7" onClick={go(() => void useWorkspaceStore.getState().chooseFolder())}>
              바꾸기
            </Button>
          </div>
        </Section>

        <Section title="편집">
          <label className="flex items-center gap-2">
            <span>글 너비</span>
            <input
              aria-label="글 너비"
              type="number"
              min={MIN_EDITOR_WIDTH}
              max={MAX_EDITOR_WIDTH}
              step={32}
              value={ui.editorWidth}
              onChange={(e) => ui.setEditorWidth(Number(e.target.value) || DEFAULT_EDITOR_WIDTH)}
              className="w-24 rounded-md border bg-background px-2 py-1 tabular-nums"
            />
            <span className="text-muted-foreground">px</span>
            <button type="button" onClick={() => ui.setEditorWidth(DEFAULT_EDITOR_WIDTH)} className="text-xs text-primary underline-offset-2 hover:underline">
              기본으로
            </button>
          </label>
          <Check label="목차 띄우기" checked={ui.outlineOpen} onChange={() => ui.toggleOutline()} />
          <Check label="오른쪽 패널 보이기" checked={ui.rightPanelOpen} onChange={() => ui.toggleRightPanel()} hint="창이 좁아지면 저절로 접었다가, 넓어지면 다시 펼쳐요." />
        </Section>

        <Section title="맞춤법·문장 다듬기">
          <Check label="맞춤법 표시" checked={spell.enabled} onChange={spell.setEnabled} />
          <Check label="온라인 맞춤법 검사 (다음·네이버)" checked={spell.online} onChange={spell.setOnline} hint="켜면 문단 내용이 다음·네이버 서버로 전송돼요." />
          <Check label="문장 다듬기 표시" checked={spell.style} onChange={spell.setStyle} />
          <Button size="sm" variant="outline" className="h-7" onClick={go(() => ui.setStyleSettingsOpen(true))}>
            다듬기 규칙·긴 문장 기준·내 표기 사전…
          </Button>
        </Section>

        <Section title="AI·Git">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7" onClick={go(() => ui.setRightTab("ai"))}>
              나의 글쓰기 룰 (AI 패널)
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={go(() => ui.toggleGit())}>
              Git 자동 커밋·동기화 설정
            </Button>
          </div>
        </Section>

        <Section title="도움말·업데이트">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-7" onClick={go(() => ui.setShortcutsOpen(true))}>
              단축키 ({shortcutLabel("Mod+/")})
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={go(() => ui.setOnboardingOpen(true))}>
              시작 안내 다시 보기
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => void api.update.check()}>
              업데이트 확인
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">v{__APP_VERSION__}</span>
          </div>
        </Section>
      </div>
    </div>
  );
}
