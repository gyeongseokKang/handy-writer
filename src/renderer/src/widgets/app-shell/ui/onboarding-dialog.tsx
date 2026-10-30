import { ChevronLeft, ChevronRight, PenLine, X } from "lucide-react";
import { useState } from "react";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { shortcutLabel } from "@/shared/lib/shortcut";
import { Button } from "@/shared/ui/button";

export const ONBOARDED_KEY = "handy-writer:onboarded";

/** 처음 한 번 보여 줬는지. 저장소를 못 쓰면 보여 준 것으로 본다 (매번 뜨지 않게). */
export function wasOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) !== null;
  } catch {
    return true;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // 저장소를 못 써도 괜찮다.
  }
}

const STEPS = [
  {
    title: "쓰기",
    lines: ["`/`를 누르면 제목·목록·표·각주·그림 번호 같은 블록을 넣어요.", "`[[`로 다른 글을 잇고, `[[#`로 이 글의 그림·표·제목을 가리켜요.", "글은 작업 폴더의 마크다운 파일이라 Obsidian·git과 그대로 같이 써요."],
  },
  {
    title: "찾기와 명령",
    lines: [`${shortcutLabel("Mod+K")} 로 글을 찾고, \`>\`를 입력하면 모든 명령을 이름으로 찾아 실행해요.`, `${shortcutLabel("Mod+/")} 로 단축키를, ${shortcutLabel("Mod+,")} 로 설정을 열어요.`, "글 목록에서 Cmd/Ctrl+클릭은 새 탭, Alt+클릭은 옆에 나란히 열기예요."],
  },
  {
    title: "다듬기와 정리",
    lines: ["맞춤법은 빨간 물결, 문장 다듬기는 파란 점선으로 알려 줘요.", "제목 아래 `+ 태그`를 누르면 기존 태그에서 어울리는 것을 추천해요.", "AI 탭에서 교정·다듬기, AI로 목차와 초안을 만들 수 있어요."],
  },
  {
    title: "안심하고 쓰기",
    lines: ["자동 저장되고, 고친 부분만 다시 써서 원래 마크다운을 지켜요.", "다른 프로그램이 같은 글을 바꾸면 덮어쓰지 않고 고르게 해요.", "Git을 연결하면 변경 기록에서 버전을 넘겨 보고 되돌릴 수 있어요."],
  },
];

/** 처음 실행할 때 한 번 보여 주는 짧은 안내. 설정이나 명령에서 다시 볼 수 있다. */
export function OnboardingDialog() {
  const [step, setStep] = useState(0);
  const close = () => {
    markOnboarded();
    useUiStore.getState().setOnboardingOpen(false);
  };
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;
  const render = (line: string) => line.split(/(`[^`]+`)/).map((part, i) => (part.startsWith("`") ? <code key={i} className="rounded bg-muted px-1 text-[0.9em]">{part.slice(1, -1)}</code> : part));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Handy Writer 시작 안내"
        tabIndex={-1}
        ref={(el) => el?.focus()}
        className="w-full max-w-md space-y-4 rounded-xl border bg-card px-6 py-5 text-sm shadow-2xl outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          else if (event.key === "ArrowRight" && !last) setStep(step + 1);
          else if (event.key === "ArrowLeft" && step > 0) setStep(step - 1);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <PenLine className="size-4" /> Handy Writer 둘러보기
          </h2>
          <button type="button" aria-label="안내 닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <section aria-label={current.title} className="min-h-36 space-y-2">
          <p className="text-xs text-muted-foreground">
            {step + 1} / {STEPS.length}
          </p>
          <h3 className="text-lg font-semibold">{current.title}</h3>
          <ul className="list-disc space-y-1.5 pl-5 leading-6">
            {current.lines.map((line) => (
              <li key={line}>{render(line)}</li>
            ))}
          </ul>
        </section>
        <div className="flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s.title} className={`size-1.5 rounded-full ${i === step ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            {step > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setStep(step - 1)}>
                <ChevronLeft /> 이전
              </Button>
            )}
            {last ? (
              <Button size="sm" onClick={close}>
                시작하기
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                다음 <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
