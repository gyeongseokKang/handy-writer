import DragHandle from "@tiptap/extension-drag-handle-react";
import { EditorContent, useEditor } from "@tiptap/react";
import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { LogIndicator } from "@/entities/log/ui/log-indicator";
import { NotePathContext } from "@/entities/note/model/note-path-context";
import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useEmbedStore } from "@/entities/note/model/use-embed-store";
import { useOutlineStore } from "@/entities/note/model/use-outline-store";
import { useSpellStore } from "@/entities/note/model/use-spell-store";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { linkTargetToName, useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { serializeNote, splitFrontmatter } from "@shared/frontmatter";
import { addFrontmatterTags } from "@shared/frontmatter-tags";
import { formatGoal, parseGoal, setFrontmatterLine, type WritingGoal } from "@shared/text-stats";
import { issueKey } from "@shared/spellcheck";
import { registerFlusher } from "@/shared/lib/pending-saves";
import { cn } from "@/shared/lib/utils";

import { createExtensions } from "../lib/create-extensions";
import { createEditorBridge } from "../lib/editor-bridge";
import { createSourceKeeper } from "../lib/source-keeper";
import { SPELL_REFRESH, type SpellTarget } from "../lib/spell-check";
import { BubbleToolbar } from "./bubble-toolbar";
import { EditorWidthHandles } from "./editor-width-handles";
import { ConflictBar } from "./conflict-bar";
import { FindBar } from "./find-bar";
import { TableMenu } from "./table-menu";
import { TextCount } from "./text-count";
import { ExportMenu } from "./export-menu";
import { NoteTitle } from "./note-title";
import { SpellMenu } from "./spell-menu";
import { SpellPopover } from "./spell-popover";

const SPELL_HOVER_CLOSE_MS = 250;

const SAVE_DELAY_MS = 600;

type SaveStatus = "loading" | "saved" | "saving" | "error" | "conflict";

/** 저장에 실패하면 이 간격(초)으로 다시 시도한다. 마지막 간격을 계속 쓴다. */
const RETRY_SECONDS = [2, 4, 8, 16, 30];

const STATUS_LABEL: Record<SaveStatus, string> = {
  loading: "불러오는 중…",
  saved: "저장됨",
  saving: "저장 중…",
  error: "저장 실패 · 다시 시도 중",
  conflict: "충돌 · 저장 멈춤",
};

interface NoteEditorProps {
  path: string;
  name: string;
  /**
   * main: 가운데 에디터. AI·목차·첨부·맞춤법 패널과 연결된다.
   * side: 분할 화면의 오른쪽 에디터. 편집과 저장은 같지만 패널과는 연결하지 않는다.
   */
  pane?: "main" | "side";
}

/** setContent(emitUpdate: false)로 내용을 통째로 바꾼 뒤, 다른 패널이 보는 임베드 목록과 목차를 다시 읽게 한다. */
function syncPanels() {
  const bridge = useEditorBridge.getState().bridge;
  useEmbedStore.getState().setItems(bridge?.listEmbeds() ?? []);
  useOutlineStore.getState().setHeadings(bridge?.listHeadings() ?? []);
  // 화면에 그려진 뒤에야 제목 위치를 잴 수 있다.
  window.requestAnimationFrame(() => useOutlineStore.getState().setActivePos(useEditorBridge.getState().bridge?.headingInViewPos() ?? null));
}

/** 글 하나를 편집한다. 글이 바뀌면 key로 새로 마운트되므로 상태가 섞이지 않는다. */
export function NoteEditor({ path, name, pane = "main" }: NoteEditorProps) {
  const isMain = pane === "main";
  const [status, setStatus] = useState<SaveStatus>("loading");
  const frontmatterRef = useRef("");
  // 아래 막대의 목표 분량이 frontmatter를 따라 다시 그려지도록 상태로도 들고 있는다.
  const [frontmatter, setFrontmatter] = useState("");
  const lastSavedRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const [findOpen, setFindOpen] = useState(false);
  const [spellTarget, setSpellTarget] = useState<SpellTarget | null>(null);
  const editorWidth = useUiStore((s) => s.editorWidth);
  const columnRef = useRef<HTMLDivElement>(null);
  // 마우스를 올려 띄운 제안 창은 마우스가 밑줄과 창을 모두 떠나면 잠시 뒤 닫는다.
  const spellCloseRef = useRef<number | undefined>(undefined);
  const cancelSpellClose = () => window.clearTimeout(spellCloseRef.current);
  const scheduleSpellClose = () => {
    cancelSpellClose();
    spellCloseRef.current = window.setTimeout(() => setSpellTarget((prev) => (prev?.hover ? null : prev)), SPELL_HOVER_CLOSE_MS);
  };

  const extensions = useMemo(
    () =>
      createExtensions({
        spell: !isMain ? undefined : {
          isEnabled: () => useSpellStore.getState().enabled,
          isStyleEnabled: () => useSpellStore.getState().style,
          getStyleOptions: () => {
            const { longSentence, styleOff, dictionary } = useSpellStore.getState();
            return { longSentence, off: styleOff, dictionary };
          },
          isIgnored: (key) => useSpellStore.getState().ignored.includes(key),
          onItems: (items) => useSpellStore.getState().setItems(items),
          onSelect: (target) => {
            cancelSpellClose();
            // 눌러서 연 창은 마우스를 올려 바뀌지 않게 둔다.
            setSpellTarget((prev) => (target.hover && prev && !prev.hover ? prev : target));
          },
          onHoverEnd: () => scheduleSpellClose(),
          checkOnline: (text) => api.spell.check(text),
          isOnlineEnabled: () => useSpellStore.getState().online,
          onOnlineStatus: (status) => useSpellStore.getState().setOnlineState(status),
        },
        getNoteNames: () => useWorkspaceStore.getState().notes.map((note) => note.name),
        onNavigate: (target) => void useWorkspaceStore.getState().openLink(target),
        // `#`으로 시작하는 링크는 이 글 안을 가리킨다 (그림·표 참조는 따로 표시한다).
        isResolved: (target) => target.startsWith("#") || useNoteIndexStore.getState().resolve(target) !== null,
        onTagClick: (tag) => useUiStore.getState().showTag(tag),
      }),
    [],
  );

  const flushRef = useRef<() => Promise<void>>(async () => {});
  // 저장할 때 손대지 않은 블록은 원문 그대로 쓴다 (표 간격, 주소 표기 등이 바뀌지 않게).
  const keeperRef = useRef<ReturnType<typeof createSourceKeeper> | null>(null);
  const toMarkdown = () => keeperRef.current?.serialize() ?? editor?.getMarkdown() ?? "";

  const editor = useEditor({
    extensions,
    content: "",
    editorProps: { attributes: { class: "note-prose", spellcheck: "false" } },
    onUpdate: () => {
      dirtyRef.current = true;
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
    },
  });

  // 저장 실패와 바깥 변경 충돌. 둘 다 디스크에 쓰지 못한 내용이 남아 있다는 뜻이다.
  const statusRef = useRef<SaveStatus>("loading");
  statusRef.current = status;
  const retryRef = useRef({ count: 0, timer: undefined as number | undefined });
  const [conflict, setConflict] = useState<{ theirs: string } | null>(null);
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;

  const scheduleRetry = () => {
    const retry = retryRef.current;
    window.clearTimeout(retry.timer);
    const seconds = RETRY_SECONDS[Math.min(retry.count, RETRY_SECONDS.length - 1)]!;
    retry.count++;
    retry.timer = window.setTimeout(() => void flushRef.current(), seconds * 1000);
  };

  flushRef.current = async () => {
    window.clearTimeout(timerRef.current);
    window.clearTimeout(retryRef.current.timer);
    // 충돌을 고를 때까지는 바깥 변경을 덮어쓰지 않는다.
    if (!editor || editor.isDestroyed || !dirtyRef.current || conflictRef.current) return;
    dirtyRef.current = false;
    const next = serializeNote(frontmatterRef.current, toMarkdown());
    if (next === lastSavedRef.current) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    try {
      // 마지막으로 읽거나 쓴 뒤에 다른 프로그램이 파일을 바꿨으면 쓰지 않고 고르게 한다.
      const disk = await api.notes.read(path).catch(() => null);
      if (disk !== null && disk !== lastSavedRef.current && disk !== next) {
        dirtyRef.current = true;
        setConflict({ theirs: disk });
        setStatus("conflict");
        return;
      }
      await api.notes.write(path, next);
      lastSavedRef.current = next;
      keeperRef.current?.setBase(splitFrontmatter(next).body);
      retryRef.current.count = 0;
      setStatus(dirtyRef.current ? "saving" : "saved");
    } catch (error) {
      dirtyRef.current = true;
      setStatus("error");
      // 처음 실패할 때만 알리고, 그 뒤로는 조용히 다시 시도한다.
      if (retryRef.current.count === 0) toast.error(`저장하지 못했어요. 잠시 뒤 다시 시도할게요: ${error instanceof Error ? error.message : String(error)}`);
      scheduleRetry();
    }
  };

  /** 충돌 고르기: mine이면 내 내용으로 덮어쓰고, theirs면 바깥 내용을 불러온다. */
  const resolveConflict = (choice: "mine" | "theirs") => {
    const current = conflictRef.current;
    if (!editor || !current) return;
    if (choice === "theirs") {
      const { frontmatter, body } = splitFrontmatter(current.theirs);
      frontmatterRef.current = frontmatter;
      setFrontmatter(frontmatter);
      lastSavedRef.current = current.theirs;
      dirtyRef.current = false;
      editor.commands.setContent(body, { contentType: "markdown", emitUpdate: false });
      keeperRef.current?.setBase(body);
      if (isMain) syncPanels();
      conflictRef.current = null;
      setConflict(null);
      setStatus("saved");
      return;
    }
    // 바깥 내용을 마지막으로 읽은 것으로 보고 다시 저장한다.
    lastSavedRef.current = current.theirs;
    dirtyRef.current = true;
    conflictRef.current = null;
    setConflict(null);
    void flushRef.current();
  };

  // 글 내용 불러오기
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    api.notes
      .read(path)
      .then((raw) => {
        if (cancelled || editor.isDestroyed) return;
        const { frontmatter, body } = splitFrontmatter(raw);
        frontmatterRef.current = frontmatter;
        setFrontmatter(frontmatter);
        lastSavedRef.current = raw;
        editor.commands.setContent(body, { contentType: "markdown", emitUpdate: false });
        keeperRef.current ??= createSourceKeeper(editor);
        keeperRef.current.setBase(body);
        setStatus("saved");
        if (isMain) syncPanels();
        if (raw === "" && isMain) editor.commands.focus("start");
        // 검색 결과에서 열었으면 찾은 단어로 이동
        const find = isMain ? useUiStore.getState().pendingFind : null;
        if (find) {
          useUiStore.getState().setPendingFind(null);
          useEditorBridge.getState().bridge?.findAndSelect(find);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(`글을 열지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [editor, path]);

  // AI 패널이 선택한 글을 읽고 결과를 적용할 수 있게 에디터를 등록
  const nameRef = useRef(name);
  nameRef.current = name;
  useEffect(() => {
    if (!editor || !isMain) return;
    const bridge = createEditorBridge(editor, () => nameRef.current, { addTags: (tags) => addTagsRef.current(tags) });
    useEditorBridge.getState().setBridge(bridge);
    // 첨부 패널이 보여줄 임베드 목록과 목차를 글이 바뀔 때마다 갱신한다.
    const syncEmbeds = () => {
      useEmbedStore.getState().setItems(bridge.listEmbeds());
      useOutlineStore.getState().setHeadings(bridge.listHeadings());
    };
    // 글을 불러오며 선택이 바뀔 때는 무시하고, 사용자가 커서를 옮길 때만 따라간다.
    const syncActiveHeading = () => {
      if (editor.isFocused) useOutlineStore.getState().setActivePos(bridge.currentHeadingPos());
    };
    syncEmbeds();
    editor.on("update", syncEmbeds);
    editor.on("create", syncEmbeds);
    editor.on("selectionUpdate", syncActiveHeading);
    return () => {
      editor.off("update", syncEmbeds);
      editor.off("create", syncEmbeds);
      editor.off("selectionUpdate", syncActiveHeading);
      if (useEditorBridge.getState().bridge === bridge) {
        useEditorBridge.getState().setBridge(null);
        useEmbedStore.getState().setItems([]);
        useOutlineStore.getState().setHeadings([]);
        useOutlineStore.getState().setActivePos(null);
      }
    };
  }, [editor]);

  // 맞춤법 표시를 켜고 끄거나 낱말을 무시하면 밑줄을 다시 계산
  const spellEnabled = useSpellStore((state) => state.enabled);
  const spellIgnored = useSpellStore((state) => state.ignored);
  const spellOnline = useSpellStore((state) => state.online);
  const spellStyle = useSpellStore((state) => state.style);
  const styleLong = useSpellStore((state) => state.longSentence);
  const styleOff = useSpellStore((state) => state.styleOff);
  const styleDictionary = useSpellStore((state) => state.dictionary);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(SPELL_REFRESH, true));
  }, [editor, spellEnabled, spellIgnored, spellOnline, spellStyle, styleLong, styleOff, styleDictionary]);
  useEffect(() => () => {
    if (isMain) useSpellStore.getState().setItems([]);
  }, []);

  // 분할 화면에서 단축키가 마지막으로 만진 에디터로 가게 한다.
  useEffect(() => {
    if (!editor) return;
    const onFocus = () => useUiStore.getState().setFocusedPane(pane);
    editor.on("focus", onFocus);
    return () => {
      editor.off("focus", onFocus);
    };
  }, [editor, pane]);
  // 분할 화면이 없으면 가운데 에디터가 언제나 단축키를 받는다.
  const isShortcutTarget = () => (isMain && !useWorkspaceStore.getState().splitPath) || useUiStore.getState().focusedPane === pane;

  // 오른쪽 패널의 태그 추가: frontmatter의 tags에 더하고 바로 저장한다.
  const addTagsRef = useRef<(tags: string[]) => void>(() => {});
  addTagsRef.current = (tags) => {
    try {
      const next = addFrontmatterTags(frontmatterRef.current, tags);
      if (next === frontmatterRef.current) return;
      frontmatterRef.current = next;
      setFrontmatter(next);
      dirtyRef.current = true;
      void flushRef.current();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const changeGoal = (goal: WritingGoal | null) => {
    const next = setFrontmatterLine(frontmatterRef.current, "goal", goal ? formatGoal(goal) : null);
    frontmatterRef.current = next;
    setFrontmatter(next);
    dirtyRef.current = true;
    void flushRef.current();
  };

  const applySpell = (replacement?: string) => {
    if (!editor || !spellTarget) return;
    const { issue, from, to } = spellTarget;
    // 밑줄을 누른 뒤에 글이 바뀌었으면 엉뚱한 곳을 고치지 않는다.
    if (to <= editor.state.doc.content.size && editor.state.doc.textBetween(from, to, undefined, "\uFFFC") === issue.text) {
      editor.view.dispatch(editor.state.tr.insertText(replacement ?? issue.replacement, from, to));
      editor.view.focus();
    }
    setSpellTarget(null);
  };

  // 색인이 바뀌면(글이 생기거나 지워지면) 없는 글로 가는 링크 표시를 다시 계산
  const indexEntries = useNoteIndexStore((state) => state.entries);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("refreshDecorations", true));
  }, [editor, indexEntries]);

  // 글을 바꾸거나 닫기 전에 저장 대기 중인 내용을 쓸 수 있게 등록
  useEffect(() => registerFlusher(path, () => flushRef.current(), () => dirtyRef.current || statusRef.current === "error" || statusRef.current === "conflict"), [path]);
  useEffect(() => () => window.clearTimeout(retryRef.current.timer), []);

  // Cmd/Ctrl+F로 글 안에서 찾기를 연다. 이미 열려 있으면 찾는 칸으로 포커스를 돌린다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "f") return;
      if (!isShortcutTarget()) return;
      event.preventDefault();
      setFindOpen(true);
      document.querySelector<HTMLInputElement>("[role='search'] input")?.select();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // 창을 닫을 때도 마지막 내용을 저장
  useEffect(() => {
    const onHide = () => void flushRef.current();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  // 다른 프로그램(Obsidian, git 등)이 같은 파일을 바꿨을 때 반영
  const externalChange = useWorkspaceStore((state) => state.externalChange);
  useEffect(() => {
    if (!editor || !externalChange?.paths.includes(path)) return;
    let cancelled = false;
    api.notes
      .read(path)
      .then((raw) => {
        if (cancelled || editor.isDestroyed || raw === lastSavedRef.current) return;
        // 방금 우리가 쓴 내용이 뒤늦게 감지된 경우
        if (raw === serializeNote(frontmatterRef.current, toMarkdown())) {
          lastSavedRef.current = raw;
          return;
        }
        // 아직 저장하지 않은 내 변경이 있으면 덮어쓰지도, 버리지도 않고 고르게 한다.
        if (dirtyRef.current || statusRef.current === "error") {
          setConflict({ theirs: raw });
          setStatus("conflict");
          return;
        }
        const { frontmatter, body } = splitFrontmatter(raw);
        frontmatterRef.current = frontmatter;
        setFrontmatter(frontmatter);
        lastSavedRef.current = raw;
        editor.commands.setContent(body, { contentType: "markdown", emitUpdate: false });
        keeperRef.current?.setBase(body);
        if (isMain) syncPanels();
        toast.info("다른 곳에서 바뀐 내용을 불러왔어요.");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [editor, externalChange, path]);

  // 스크롤하면 목차에 지금 읽고 있는 제목을 표시한다 (한 프레임에 한 번만 계산).
  const scrollFrame = useRef<number | null>(null);
  const onScroll = () => {
    if (!isMain || scrollFrame.current !== null) return;
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = null;
      const pos = useEditorBridge.getState().bridge?.headingInViewPos();
      if (pos !== undefined) useOutlineStore.getState().setActivePos(pos);
    });
  };
  useEffect(() => () => {
    if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current);
  }, []);

  if (!editor) return null;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {findOpen && <FindBar editor={editor} onClose={() => setFindOpen(false)} />}
      {/* 글 칸이 화면보다 넓게 정해져 있으면 양옆 너비 손잡이가 칸 밖으로 조금 나가 가로 스크롤이 생기므로 가로는 숨긴다. */}
      <div data-note-scroller className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" onScroll={onScroll}>
        <div ref={columnRef} data-note-column className="relative mx-auto w-full px-12 pt-14 pb-40" style={{ maxWidth: editorWidth }}>
          <EditorWidthHandles columnRef={columnRef} />
          <NoteTitle path={path} name={name} onEnter={() => editor.commands.focus("start")} />
          <div className="relative mt-6">
            <DragHandle editor={editor}>
              <div className="block-handle" title="드래그해서 옮기기">
                <GripVertical className="size-4" />
              </div>
            </DragHandle>
            <NotePathContext.Provider value={path}>
              <EditorContent editor={editor} />
            </NotePathContext.Provider>
          </div>
        </div>
      </div>
      <BubbleToolbar editor={editor} />
      <TableMenu editor={editor} />
      {spellTarget && (
        <SpellPopover
          target={spellTarget}
          onApply={applySpell}
          onIgnore={() => {
            useSpellStore.getState().ignore(issueKey(spellTarget.issue));
            setSpellTarget(null);
          }}
          onClose={() => setSpellTarget(null)}
          onMouseEnter={cancelSpellClose}
          onMouseLeave={() => spellTarget.hover && scheduleSpellClose()}
        />
      )}
      {/* 떠 있는 목차와 겹치지 않게 아래 막대 바로 위에 띄운다. */}
      {conflict && <ConflictBar mine={serializeNote(frontmatterRef.current, toMarkdown())} theirs={conflict.theirs} onResolve={resolveConflict} />}
      <footer className="flex min-w-0 items-center gap-3 border-t px-6 py-1.5 text-xs whitespace-nowrap text-muted-foreground [&>*]:shrink-0">
        <span className="min-w-0 !shrink truncate">{linkTargetToName(name)}</span>
        <TextCount editor={editor} goal={parseGoal(frontmatter)} onGoalChange={changeGoal} />
        {isMain ? <SpellMenu /> : <span className="ml-auto" />}
        <button
          type="button"
          title="변경 기록 (Ctrl/Cmd+Shift+H)"
          onClick={() => useUiStore.getState().setHistoryTarget({ path, name })}
          className="rounded px-1.5 py-0.5 hover:bg-accent"
        >
          기록
        </button>
        <ExportMenu editor={editor} path={path} name={name} getFrontmatter={() => frontmatterRef.current} getMarkdown={toMarkdown} isShortcutTarget={isShortcutTarget} />
        {status === "error" ? (
          <button type="button" role="status" title="지금 다시 저장하기" onClick={() => { retryRef.current.count = 0; void flushRef.current(); }} className="rounded px-1.5 py-0.5 text-destructive hover:bg-accent">
            {STATUS_LABEL[status]}
          </button>
        ) : (
          <span role="status" className={cn(status === "conflict" && "text-amber-600 dark:text-amber-400")}>{STATUS_LABEL[status]}</span>
        )}
        {isMain && <LogIndicator />}
      </footer>
    </div>
  );
}
