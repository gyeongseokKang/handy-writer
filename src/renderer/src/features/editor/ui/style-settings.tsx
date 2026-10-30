import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useSpellStore } from "@/entities/note/model/use-spell-store";
import { Button } from "@/shared/ui/button";
import { parseStyleDictionary, STYLE_DICTIONARY_PATH, STYLE_DICTIONARY_TEMPLATE, STYLE_GROUPS } from "@shared/style-lint";

/** 문장 다듬기 설정: 긴 문장 기준, 규칙별 켜고 끄기, 작업 폴더의 내 표기 사전 편집 */
export function StyleSettings({ onClose }: { onClose: () => void }) {
  const longSentence = useSpellStore((s) => s.longSentence);
  const styleOff = useSpellStore((s) => s.styleOff);
  const savedText = useSpellStore((s) => s.dictionaryText);
  const [text, setText] = useState(savedText || STYLE_DICTIONARY_TEMPLATE);
  const [length, setLength] = useState(String(longSentence));
  const [saving, setSaving] = useState(false);
  const entries = parseStyleDictionary(text);
  const { setLongSentence, setStyleGroup, saveDictionary } = useSpellStore.getState();

  const save = async () => {
    setSaving(true);
    try {
      setLongSentence(Number(length));
      if (text !== (savedText || STYLE_DICTIONARY_TEMPLATE) || savedText) await saveDictionary(text);
      toast.success("다듬기 설정을 저장했어요.");
      onClose();
    } catch (error) {
      toast.error(`저장하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[8vh] whitespace-normal" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="문장 다듬기 설정"
        className="w-full max-w-lg space-y-4 rounded-xl border bg-card px-6 py-5 text-sm shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">문장 다듬기 설정</h2>
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-medium">알려 줄 것</legend>
          {STYLE_GROUPS.map((group) => (
            <label key={group.id} className="flex items-center gap-2">
              <input type="checkbox" checked={!styleOff.includes(group.id)} onChange={(e) => setStyleGroup(group.id, e.target.checked)} />
              {group.label}
            </label>
          ))}
        </fieldset>

        <label className="flex items-center gap-2">
          <span className="font-medium">긴 문장 기준</span>
          <input
            aria-label="긴 문장 기준 글자 수"
            type="number"
            min={20}
            max={400}
            step={10}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            className="w-20 rounded-md border bg-background px-2 py-1 tabular-nums"
          />
          <span className="text-muted-foreground">자보다 길면 알려요</span>
        </label>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">내 표기 사전</span>
            <span className="text-xs text-muted-foreground">{entries.length}개 · 작업 폴더의 {STYLE_DICTIONARY_PATH}</span>
          </div>
          <textarea
            aria-label="내 표기 사전 내용"
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 font-mono text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">파일이라 git으로 글과 함께 관리돼요. 다른 컴퓨터에서도 같은 사전을 써요. 끄고 켜는 설정과 긴 문장 기준은 이 컴퓨터에만 저장돼요.</p>
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button size="sm" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
