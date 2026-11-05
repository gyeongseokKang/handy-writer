import { toast } from "sonner";

import type { Command } from "@/entities/command/model/use-command-store";
import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useFavoritesStore } from "@/entities/note/model/use-favorites-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { toggleSplit } from "@/features/note-tabs/ui/tab-bar";
import { createReviewNote, makeCurrentNoteReview } from "@/features/review/model/review-actions";
import { saveAndCommit } from "./save-commit";

const ui = () => useUiStore.getState();
const ws = () => useWorkspaceStore.getState();
const hasNote = () => ws().activePath !== null;
const toEditor = () => ui().setView("editor");
const activeFolder = () => ws().notes.find((note) => note.path === ws().activePath)?.folder ?? "";

/** 명령 팔레트(`>`)와 단축키 안내에 나오는 명령. 단축키는 실제로 받는 곳(app-shell, 에디터)과 맞춰 둔다. */
export function buildCommands(): Command[] {
  return [
    // 글
    { id: "note.new", group: "글", title: "새 글", keywords: ["new", "만들기"], run: () => void ws().createNote() },
    { id: "note.extract", group: "글", title: "링크에서 글 가져오기", keywords: ["추출", "url", "웹", "유튜브"], run: () => ui().setExtract({ mode: "new" }) },
    { id: "note.draft", group: "글", title: "AI로 초안 만들기", keywords: ["ai", "목차", "draft"], run: () => ui().setDraftOpen(true) },
    { id: "note.search", group: "글", title: "글 검색", shortcut: "Mod+K", keywords: ["찾기", "search"], run: () => ui().setPaletteOpen(true) },
    { id: "note.find", group: "글", title: "글 안에서 찾기·바꾸기", shortcut: "Mod+F", keywords: ["find", "replace"], enabled: hasNote, run: () => (toEditor(), ui().requestEditor("find")) },
    {
      id: "note.history",
      group: "글",
      title: "변경 기록 보기",
      shortcut: "Mod+Shift+H",
      keywords: ["history", "git", "버전"],
      enabled: hasNote,
      run: () => {
        const note = ws().notes.find((n) => n.path === ws().activePath);
        if (note) ui().setHistoryTarget({ path: note.path, name: note.name });
      },
    },
    {
      id: "note.images-row",
      group: "글",
      title: "이미지 나란히 놓기",
      keywords: ["image", "나란히", "묶음", "갤러리", "사진", "라벨", "캡션"],
      enabled: hasNote,
      run: () => {
        toEditor();
        if (!useEditorBridge.getState().bridge?.arrangeImages()) toast.info("나란히 놓을 이미지가 없어요. 이미지 줄에 커서를 두거나, 이미지가 든 블록을 여러 개 선택해 주세요.");
      },
    },
    {
      id: "note.images-split",
      group: "글",
      title: "나란히 놓은 이미지 풀기",
      keywords: ["image", "나란히", "묶음", "사진"],
      enabled: hasNote,
      run: () => {
        toEditor();
        if (!useEditorBridge.getState().bridge?.splitImageRow()) toast.info("나란히 놓은 이미지 줄에 커서를 두고 실행해 주세요.");
      },
    },
    { id: "note.commit", group: "글", title: "지금 글 커밋 (여기까지 기록에 남기기)", shortcut: "Mod+S", keywords: ["저장", "save", "commit", "git"], enabled: hasNote, run: () => void saveAndCommit() },
    { id: "note.copy-rich", group: "글", title: "서식 있는 글로 복사", shortcut: "Mod+Shift+C", keywords: ["copy", "블로그", "html"], enabled: hasNote, run: () => ui().requestEditor("copy-rich") },
    { id: "note.export-md", group: "글", title: "마크다운으로 내보내기", keywords: ["export", "md"], enabled: hasNote, run: () => ui().requestEditor("export-md") },
    { id: "note.export-html", group: "글", title: "HTML로 내보내기", keywords: ["export", "웹 문서"], enabled: hasNote, run: () => ui().requestEditor("export-html") },
    { id: "note.export-pdf", group: "글", title: "PDF로 내보내기", keywords: ["export", "인쇄"], enabled: hasNote, run: () => ui().requestEditor("export-pdf") },
    { id: "note.export-docx", group: "글", title: "Word로 내보내기", keywords: ["export", "docx", "워드"], enabled: hasNote, run: () => ui().requestEditor("export-docx") },
    {
      id: "note.favorite",
      group: "글",
      title: "지금 글 즐겨찾기에 추가·빼기",
      keywords: ["즐겨찾기", "고정", "pin", "bookmark", "star"],
      enabled: hasNote,
      run: () => {
        const path = ws().activePath;
        if (path) useFavoritesStore.getState().toggle("note", path);
      },
    },
    { id: "note.manuscript", group: "글", title: "원고 보기 (지금 글의 폴더)", keywords: ["책", "장", "manuscript", "book", "묶기"], enabled: hasNote, run: () => ui().setManuscriptFolder(activeFolder()) },
    { id: "note.writing-stats", group: "글", title: "오늘 쓴 양 보기", keywords: ["통계", "연속", "잔디", "목표", "stats"], enabled: hasNote, run: () => (toEditor(), ui().setStatsOpen(true)) },

    // 탭
    { id: "tab.close", group: "탭", title: "지금 탭 닫기", shortcut: "Mod+W", enabled: hasNote, run: () => void ws().closeTab(ws().activePath!) },
    { id: "tab.reopen", group: "탭", title: "닫은 탭 다시 열기", shortcut: "Mod+Shift+T", enabled: () => ws().closedTabs.length > 0, run: () => void ws().reopenClosedTab() },
    { id: "tab.next", group: "탭", title: "다음 탭", shortcut: "Ctrl+Tab", enabled: () => ws().tabs.length > 1, run: () => void ws().cycleTab(1) },
    { id: "tab.prev", group: "탭", title: "이전 탭", shortcut: "Ctrl+Shift+Tab", enabled: () => ws().tabs.length > 1, run: () => void ws().cycleTab(-1) },
    { id: "tab.split", group: "탭", title: "분할 화면 열기·닫기", shortcut: "Mod+\\", keywords: ["split", "옆에", "나란히"], run: toggleSplit },

    // 보기
    { id: "view.focus", group: "보기", title: "집중 모드 켜기·끄기", shortcut: "Mod+Shift+D", keywords: ["focus", "zen", "타자기", "방해 금지", "전체 화면"], enabled: hasNote, run: () => (toEditor(), ui().toggleFocusMode()) },
    { id: "view.outline", group: "보기", title: "목차 보이기·숨기기", keywords: ["outline"], run: () => ui().toggleOutline() },
    { id: "view.outline-pin", group: "보기", title: "목차 펼친 채로 고정·해제", keywords: ["outline", "pin", "고정", "펼치기"], run: () => ui().setOutlinePinned(!ui().outlinePinned) },
    { id: "view.sidebar", group: "보기", title: "왼쪽 사이드바 보이기·숨기기", shortcut: "Mod+Alt+[", keywords: ["sidebar", "글 목록"], run: () => ui().toggleSidebar() },
    { id: "view.right", group: "보기", title: "오른쪽 패널 보이기·숨기기", shortcut: "Mod+Alt+]", keywords: ["panel"], run: () => ui().toggleRightPanel() },
    { id: "view.graph", group: "보기", title: "그래프 보기", keywords: ["graph", "연결"], run: () => ui().setView(ui().view === "graph" ? "editor" : "graph") },
    { id: "view.links", group: "보기", title: "연결·태그 패널 열기", keywords: ["태그", "백링크", "tag"], run: () => ui().setRightTab("links") },
    { id: "view.files", group: "보기", title: "첨부 패널 열기", keywords: ["이미지", "attachment"], run: () => ui().setRightTab("files") },
    { id: "view.ai", group: "보기", title: "AI 패널 열기", keywords: ["ai", "다듬기", "교정"], run: () => ui().setRightTab("ai") },
    { id: "view.spell", group: "보기", title: "맞춤법 패널 열기", keywords: ["spell", "다듬기"], run: () => ui().setRightTab("spell") },
    { id: "view.git", group: "보기", title: "Git 화면 열기", keywords: ["git", "커밋", "동기화"], run: () => ui().toggleGit() },

    // 앱
    { id: "app.settings", group: "앱", title: "설정", shortcut: "Mod+,", keywords: ["settings", "환경"], run: () => ui().setSettingsOpen(true) },
    { id: "app.style", group: "앱", title: "문장 다듬기 설정·내 표기 사전", keywords: ["style", "사전"], run: () => ui().setStyleSettingsOpen(true) },
    { id: "app.help", group: "앱", title: "도움말 (기능 안내)", shortcut: "F1", keywords: ["help", "도움말", "기능", "설명", "사용법"], run: () => ui().setHelpOpen(true) },
    { id: "app.review", group: "앱", title: "새 리뷰 글 쓰기 (핸디 리뷰)", keywords: ["review", "리뷰", "배포", "쿠팡"], run: () => void createReviewNote() },
    { id: "app.review-note", group: "앱", title: "이 글을 핸디 리뷰로 만들기·게시", keywords: ["review", "리뷰", "게시", "배포", "발행"], run: () => makeCurrentNoteReview() },
    { id: "app.shortcuts", group: "앱", title: "단축키 보기", shortcut: "Mod+/", keywords: ["shortcut", "키"], run: () => ui().setShortcutsOpen(true) },
    { id: "app.commands", group: "앱", title: "명령 실행", shortcut: "Mod+Shift+P", keywords: ["command"], run: () => ui().setPaletteOpen(true, ">") },
    { id: "app.folder", group: "앱", title: "작업 폴더 바꾸기", keywords: ["folder", "볼트"], run: () => void ws().chooseFolder() },
    { id: "app.onboarding", group: "앱", title: "시작 안내 다시 보기", keywords: ["도움말", "help", "tour"], run: () => ui().setOnboardingOpen(true) },
  ];
}

/** 명령이 아닌 에디터 안의 단축키·입력 규칙 (단축키 안내에만 보여 준다) */
export const EDITOR_SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "/", label: "블록 메뉴 (제목, 목록, 표, 각주, 그림 번호, 링크에서 가져오기…)" },
  { keys: "[[", label: "다른 글 연결 · [[# 이 글의 그림·표·제목" },
  { keys: "Mod+Alt+0", label: "블록을 본문으로 바꾸기" },
  { keys: "Mod+Alt+1~3", label: "블록을 제목 1~3으로 바꾸기" },
  { keys: "Mod+Alt+4~6", label: "블록을 할 일 · 글머리 · 번호 목록으로 바꾸기" },
  { keys: "Mod+Alt+7", label: "블록을 인용으로 바꾸기" },
  { keys: "Mod+Alt+8", label: "블록을 코드 블록으로 바꾸기" },
  { keys: "Mod+Shift+↑↓", label: "블록을 위·아래로 옮기기" },
  { keys: "Mod+D", label: "블록 복제" },
  { keys: "Mod+Shift+V", label: "서식 없이 붙여넣기" },
  { keys: "Mod+B", label: "굵게" },
  { keys: "Mod+I", label: "기울임" },
  { keys: "Mod+Shift+S", label: "취소선" },
  { keys: "Mod+E", label: "인라인 코드" },
  { keys: "Mod+Shift+7", label: "번호 목록 · Mod+Shift+8 글머리 목록" },
  { keys: "Mod+Z", label: "되돌리기" },
  { keys: "Mod+Shift+Z", label: "다시 하기" },
  { keys: "Tab", label: "목록 들여쓰기 · 표의 다음 칸" },
];
