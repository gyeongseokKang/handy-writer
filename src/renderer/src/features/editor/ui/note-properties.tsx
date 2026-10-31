import { ListTree, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";
import { listProps, removeProp, renameProp, setProp, type FrontmatterProp } from "@shared/frontmatter-props";

const OPEN_KEY = "handy-writer:properties-open";

/** 태그는 바로 위 태그 줄에서 다루므로 속성 표에는 넣지 않는다. */
const HIDDEN = new Set(["tags", "tag"]);

function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** 속성 표를 펼쳐 둘지 (이 컴퓨터에 기억한다) */
export function usePropertiesOpen() {
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen((value) => {
      try {
        localStorage.setItem(OPEN_KEY, value ? "0" : "1");
      } catch {
        // 저장하지 못해도 이번에는 바뀐 대로 보여 준다.
      }
      return !value;
    });
  return [open, toggle] as const;
}

export function visibleProps(frontmatter: string) {
  return listProps(frontmatter)?.filter((prop) => !HIDDEN.has(prop.key.toLowerCase())) ?? null;
}

/** 태그 줄 끝의 `속성` 버튼 */
export function PropertiesToggle({ frontmatter, open, onToggle }: { frontmatter: string; open: boolean; onToggle: () => void }) {
  const count = useMemo(() => visibleProps(frontmatter)?.length ?? 0, [frontmatter]);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      title="글 속성 (frontmatter) 보기·고치기"
      className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground", open && "bg-accent text-accent-foreground")}
    >
      <ListTree className="size-3" />
      속성{count > 0 ? ` ${count}` : ""}
    </button>
  );
}

/** 값 칸: 고친 뒤 Enter나 칸을 벗어나면 저장하고, Esc는 되돌린다. */
function ValueInput({ prop, onCommit }: { prop: FrontmatterProp; onCommit: (value: string) => void }) {
  const [value, setValue] = useState(prop.value);
  useEffect(() => setValue(prop.value), [prop.value]);
  const commit = () => value !== prop.value && onCommit(value);
  return (
    <input
      aria-label={`${prop.key} 값`}
      value={value}
      placeholder={prop.kind === "list" ? "쉼표로 나눠 적기" : "비어 있음"}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.stopPropagation();
          setValue(prop.value);
        }
      }}
      className="w-full min-w-0 rounded bg-transparent px-1.5 py-0.5 outline-none hover:bg-accent/60 focus:bg-accent"
    />
  );
}

function KeyInput({ name, onRename }: { name: string; onRename: (next: string) => void }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const commit = () => {
    if (value.trim() && value.trim() !== name) onRename(value.trim());
    else setValue(name);
  };
  return (
    <input
      aria-label={`${name} 속성 이름`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.stopPropagation();
          setValue(name);
        }
      }}
      className="w-full min-w-0 rounded bg-transparent px-1.5 py-0.5 text-muted-foreground outline-none hover:bg-accent/60 focus:bg-accent focus:text-foreground"
    />
  );
}

/** 제목 아래의 속성 표. frontmatter의 항목을 보고, 고치고, 더하고, 지운다. */
export function NoteProperties({ frontmatter, onChange }: { frontmatter: string; onChange: (next: string) => void }) {
  const props = useMemo(() => visibleProps(frontmatter), [frontmatter]);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) keyRef.current?.focus();
  }, [adding]);

  const apply = (change: () => string) => {
    try {
      const next = change();
      if (next !== frontmatter) onChange(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const add = () => {
    const key = newKey.trim();
    if (!key) return setAdding(false);
    if (props?.some((prop) => prop.key === key)) return toast.error(`‘${key}’ 속성이 이미 있어요.`);
    apply(() => setProp(frontmatter, key, newValue));
    setNewKey("");
    setNewValue("");
    setAdding(false);
  };

  if (props === null) {
    return (
      <p role="note" className="mt-2 text-xs text-muted-foreground">
        frontmatter를 읽을 수 없어서 속성을 보여 주지 못해요. 파일을 다른 편집기로 열어 YAML을 고쳐 주세요.
      </p>
    );
  }

  return (
    <div role="group" aria-label="글 속성" className="mt-2 rounded-lg border bg-card/50 p-1.5 text-sm">
      {props.length === 0 && !adding && <p className="px-1.5 py-1 text-xs text-muted-foreground">속성이 없어요. 날짜, 상태, 출처 같은 정보를 더해 보세요.</p>}
      {props.map((prop) => (
        <div key={prop.key} className="group grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-1">
          <KeyInput name={prop.key} onRename={(next) => apply(() => renameProp(frontmatter, prop.key, next))} />
          {prop.kind === "bool" ? (
            <label className="flex items-center gap-2 px-1.5 py-0.5">
              <input
                type="checkbox"
                aria-label={`${prop.key} 값`}
                checked={prop.value === "true"}
                onChange={(event) => apply(() => setProp(frontmatter, prop.key, String(event.target.checked), "bool"))}
              />
              <span className="text-xs text-muted-foreground">{prop.value === "true" ? "예" : "아니오"}</span>
            </label>
          ) : prop.kind === "other" ? (
            <code title="이 값은 파일에서 직접 고쳐 주세요" className="truncate px-1.5 py-0.5 text-xs text-muted-foreground">
              {prop.value.replace(/\n\s*/g, " · ")}
            </code>
          ) : (
            <ValueInput prop={prop} onCommit={(value) => apply(() => setProp(frontmatter, prop.key, value, prop.kind))} />
          )}
          <button
            type="button"
            aria-label={`${prop.key} 속성 지우기`}
            onClick={() => apply(() => removeProp(frontmatter, prop.key))}
            className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {adding ? (
        <form
          className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <input
            ref={keyRef}
            aria-label="새 속성 이름"
            placeholder="이름"
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && (event.stopPropagation(), setAdding(false))}
            className="min-w-0 rounded bg-accent px-1.5 py-0.5 outline-none"
          />
          <input
            aria-label="새 속성 값"
            placeholder="값"
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && (event.stopPropagation(), setAdding(false))}
            className="min-w-0 rounded bg-accent px-1.5 py-0.5 outline-none"
          />
          <button type="submit" className="rounded px-1.5 py-0.5 text-xs hover:bg-accent">
            더하기
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-0.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          <Plus className="size-3" /> 속성 추가
        </button>
      )}
    </div>
  );
}
