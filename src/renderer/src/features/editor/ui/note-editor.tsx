import DragHandle from "@tiptap/extension-drag-handle-react";
import { EditorContent, useEditor } from "@tiptap/react";
import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { LogIndicator } from "@/entities/log/ui/log-indicator";
import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useEmbedStore } from "@/entities/note/model/use-embed-store";
import { useOutlineStore } from "@/entities/note/model/use-outline-store";
import { useSpellStore } from "@/entities/note/model/use-spell-store";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { linkTargetToName, useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { serializeNote, splitFrontmatter } from "@shared/frontmatter";
import { issueKey } from "@shared/spellcheck";
import { registerFlusher } from "@/shared/lib/pending-saves";

import { createExtensions } from "../lib/create-extensions";
import { createEditorBridge } from "../lib/editor-bridge";
import { SPELL_REFRESH, type SpellTarget } from "../lib/spell-check";
import { BubbleToolbar } from "./bubble-toolbar";
import { ExportMenu } from "./export-menu";
import { NoteTitle } from "./note-title";
import { SpellMenu } from "./spell-menu";
import { SpellPopover } from "./spell-popover";

const SAVE_DELAY_MS = 600;

type SaveStatus = "loading" | "saved" | "saving" | "error";

const STATUS_LABEL: Record<SaveStatus, string> = {
  loading: "불러오는 중…",
  saved: "저장됨",
  saving: "저장 중…",
  error: "저장 실패",
};

interface NoteEditorProps {
  path: string;
  name: string;
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
export function NoteEditor({ path, name }: NoteEditorProps) {
  const [status, setStatus] = useState<SaveStatus>("loading");
  const frontmatterRef = useRef("");
  const lastSavedRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  const [spellTarget, setSpellTarget] = useState<SpellTarget | null>(null);

  const extensions = useMemo(
    () =>
      createExtensions({
        spell: {
          isEnabled: () => useSpellStore.getState().enabled,
          isIgnored: (key) => useSpellStore.getState().ignored.includes(key),
          onItems: (items) => useSpellStore.getState().setItems(items),
          onSelect: setSpellTarget,
          checkOnline: (text) => api.spell.check(text),
          isOnlineEnabled: () => useSpellStore.getState().online,
          onOnlineStatus: (status) => useSpellStore.getState().setOnlineState(status),
        },
        getNoteNames: () => useWorkspaceStore.getState().notes.map((note) => note.name),
        onNavigate: (target) => void useWorkspaceStore.getState().openLink(target),
        isResolved: (target) => useNoteIndexStore.getState().resolve(target) !== null,
        onTagClick: (tag) => useUiStore.getState().showTag(tag),
      }),
    [],
  );

  const flushRef = useRef<() => Promise<void>>(async () => {});

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

  flushRef.current = async () => {
    window.clearTimeout(timerRef.current);
    if (!editor || editor.isDestroyed || !dirtyRef.current) return;
    dirtyRef.current = false;
    const next = serializeNote(frontmatterRef.current, editor.getMarkdown());
    if (next === lastSavedRef.current) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    try {
      await api.notes.write(path, next);
      lastSavedRef.current = next;
      setStatus(dirtyRef.current ? "saving" : "saved");
    } catch (error) {
      dirtyRef.current = true;
      setStatus("error");
      toast.error(`저장하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    }
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
        lastSavedRef.current = raw;
        editor.commands.setContent(body, { contentType: "markdown", emitUpdate: false });
        setStatus("saved");
        syncPanels();
        if (raw === "") editor.commands.focus("start");
        // 검색 결과에서 열었으면 찾은 단어로 이동
        const find = useUiStore.getState().pendingFind;
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
    if (!editor) return;
    const bridge = createEditorBridge(editor, () => nameRef.current);
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
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(SPELL_REFRESH, true));
  }, [editor, spellEnabled, spellIgnored, spellOnline]);
  useEffect(() => () => useSpellStore.getState().setItems([]), []);

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
  useEffect(() => registerFlusher(path, () => flushRef.current()), [path]);

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
        if (raw === serializeNote(frontmatterRef.current, editor.getMarkdown())) {
          lastSavedRef.current = raw;
          return;
        }
        if (dirtyRef.current) {
          toast.warning("이 글이 다른 곳에서도 바뀌었어요. 지금 저장하면 그 변경을 덮어써요.");
          return;
        }
        const { frontmatter, body } = splitFrontmatter(raw);
        frontmatterRef.current = frontmatter;
        lastSavedRef.current = raw;
        editor.commands.setContent(body, { contentType: "markdown", emitUpdate: false });
        syncPanels();
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
    if (scrollFrame.current !== null) return;
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
    <div className="flex h-full min-h-0 flex-col">
      <div data-note-scroller className="min-h-0 flex-1 overflow-y-auto" onScroll={onScroll}>
        <div className="mx-auto w-full max-w-3xl px-12 pt-14 pb-40">
          <NoteTitle path={path} name={name} onEnter={() => editor.commands.focus("start")} />
          <div className="relative mt-6">
            <DragHandle editor={editor}>
              <div className="block-handle" title="드래그해서 옮기기">
                <GripVertical className="size-4" />
              </div>
            </DragHandle>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      <BubbleToolbar editor={editor} />
      {spellTarget && (
        <SpellPopover
          target={spellTarget}
          onApply={applySpell}
          onIgnore={() => {
            useSpellStore.getState().ignore(issueKey(spellTarget.issue));
            setSpellTarget(null);
          }}
          onClose={() => setSpellTarget(null)}
        />
      )}
      <footer className="flex items-center gap-4 border-t px-6 py-1.5 text-xs text-muted-foreground">
        <span className="truncate">{linkTargetToName(name)}</span>
        <SpellMenu />
        <ExportMenu editor={editor} path={path} name={name} getFrontmatter={() => frontmatterRef.current} />
        <span role="status">{STATUS_LABEL[status]}</span>
        <LogIndicator />
      </footer>
    </div>
  );
}
