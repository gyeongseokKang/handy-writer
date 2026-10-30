import type { Command } from "@/entities/command/model/use-command-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { toggleSplit } from "@/features/note-tabs/ui/tab-bar";

const ui = () => useUiStore.getState();
const ws = () => useWorkspaceStore.getState();
const hasNote = () => ws().activePath !== null;
const toEditor = () => ui().setView("editor");

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
    { id: "note.copy-rich", group: "글", title: "서식 있는 글로 복사", shortcut: "Mod+Shift+C", keywords: ["copy", "블로그", "html"], enabled: hasNote, run: () => ui().requestEditor("copy-rich") },
    { id: "note.export-md", group: "글", title: "마크다운으로 내보내기", keywords: ["export", "md"], enabled: hasNote, run: () => ui().requestEditor("export-md") },
    { id: "note.export-html", group: "글", title: "HTML로 내보내기", keywords: ["export", "웹 문서"], enabled: hasNote, run: () => ui().requestEditor("export-html") },
    { id: "note.export-pdf", group: "글", title: "PDF로 내보내기", keywords: ["export", "인쇄"], enabled: hasNote, run: () => ui().requestEditor("export-pdf") },

    // 탭
    { id: "tab.close", group: "탭", title: "지금 탭 닫기", shortcut: "Mod+W", enabled: hasNote, run: () => void ws().closeTab(ws().activePath!) },
    { id: "tab.reopen", group: "탭", title: "닫은 탭 다시 열기", shortcut: "Mod+Shift+T", enabled: () => ws().closedTabs.length > 0, run: () => void ws().reopenClosedTab() },
    { id: "tab.next", group: "탭", title: "다음 탭", shortcut: "Ctrl+Tab", enabled: () => ws().tabs.length > 1, run: () => void ws().cycleTab(1) },
    { id: "tab.prev", group: "탭", title: "이전 탭", shortcut: "Ctrl+Shift+Tab", enabled: () => ws().tabs.length > 1, run: () => void ws().cycleTab(-1) },
    { id: "tab.split", group: "탭", title: "분할 화면 열기·닫기", shortcut: "Mod+\\", keywords: ["split", "옆에", "나란히"], run: toggleSplit },

    // 보기
    { id: "view.outline", group: "보기", title: "목차 보이기·숨기기", keywords: ["outline"], run: () => ui().toggleOutline() },
    { id: "view.right", group: "보기", title: "오른쪽 패널 보이기·숨기기", keywords: ["panel"], run: () => ui().toggleRightPanel() },
    { id: "view.graph", group: "보기", title: "그래프 보기", keywords: ["graph", "연결"], run: () => ui().setView(ui().view === "graph" ? "editor" : "graph") },
    { id: "view.links", group: "보기", title: "연결·태그 패널 열기", keywords: ["태그", "백링크", "tag"], run: () => ui().setRightTab("links") },
    { id: "view.files", group: "보기", title: "첨부 패널 열기", keywords: ["이미지", "attachment"], run: () => ui().setRightTab("files") },
    { id: "view.ai", group: "보기", title: "AI 패널 열기", keywords: ["ai", "다듬기", "교정"], run: () => ui().setRightTab("ai") },
    { id: "view.spell", group: "보기", title: "맞춤법 패널 열기", keywords: ["spell", "다듬기"], run: () => ui().setRightTab("spell") },
    { id: "view.git", group: "보기", title: "Git 화면 열기", keywords: ["git", "커밋", "동기화"], run: () => ui().toggleGit() },

    // 앱
    { id: "app.settings", group: "앱", title: "설정", shortcut: "Mod+,", keywords: ["settings", "환경"], run: () => ui().setSettingsOpen(true) },
    { id: "app.style", group: "앱", title: "문장 다듬기 설정·내 표기 사전", keywords: ["style", "사전"], run: () => ui().setStyleSettingsOpen(true) },
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
  { keys: "Mod+B", label: "굵게" },
  { keys: "Mod+I", label: "기울임" },
  { keys: "Mod+Z", label: "되돌리기" },
  { keys: "Mod+Shift+Z", label: "다시 하기" },
  { keys: "Tab", label: "목록 들여쓰기 · 표의 다음 칸" },
];
