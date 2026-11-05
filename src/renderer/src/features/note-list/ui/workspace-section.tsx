import { FolderOpen, GitBranch, PenLine, RefreshCw, Settings2 } from "lucide-react";

import { useGitStore } from "@/entities/git/model/use-git-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";
import { RepoSectionHeader, useSectionOpen } from "@/shared/ui/repo-section-header";

import { NoteTree } from "./note-tree";

/** 글쓰기(작업 폴더) 저장소: 맨 위에 Git 머리줄, 그 아래 글 트리. */
export function WorkspaceSection() {
  const root = useWorkspaceStore((s) => s.root);
  const chooseFolder = useWorkspaceStore((s) => s.chooseFolder);
  const gitStatus = useGitStore((s) => s.status);
  const gitBusy = useGitStore((s) => s.busy);
  const syncGit = useGitStore((s) => s.sync);
  const gitOpen = useUiStore((s) => s.gitOpen && s.rightPanelOpen);
  const [open, toggle] = useSectionOpen("workspace");

  const folderName = root?.split(/[\\/]/).filter(Boolean).pop() ?? "작업 폴더";
  const isRepo = !!gitStatus?.isRepo;
  const syncing = gitBusy === "sync";
  // 원격이 있고 올리거나 받을 것이 있을 때만 동기화 버튼을 보여 준다 (병합 중이면 Git 화면에서 풀어야 한다).
  const needsSync = !!gitStatus && isRepo && gitStatus.hasRemote && !gitStatus.merging && (gitStatus.changes.length > 0 || gitStatus.ahead > 0 || gitStatus.behind > 0);
  const syncTitle = gitStatus
    ? `동기화: 커밋 → 가져오기 → 푸시 (${[gitStatus.changes.length > 0 && `변경 ${gitStatus.changes.length}개`, gitStatus.ahead > 0 && `올릴 것 ${gitStatus.ahead}`, gitStatus.behind > 0 && `받을 것 ${gitStatus.behind}`].filter(Boolean).join(", ")})`
    : "동기화";
  const branch = !gitStatus ? null : isRepo ? (gitStatus.branch ?? "HEAD") : gitStatus.installed ? "Git 시작하기" : "Git 설치 필요";

  return (
    <section aria-label={`${folderName} 글`}>
      <RepoSectionHeader
        icon={<PenLine className="size-3.5" />}
        name={folderName}
        branch={branch}
        title={root ?? undefined}
        open={open}
        onToggle={toggle}
        onBranchClick={() => useUiStore.getState().toggleGit()}
        branchLabel="Git 상태"
        branchActive={gitOpen}
        status={gitStatus && isRepo && (
          <>
            {gitStatus.changes.length > 0 && <span className="text-amber-600" title="커밋 안 한 변경">● {gitStatus.changes.length}</span>}
            {gitStatus.ahead > 0 && <span title="올릴 커밋">↑{gitStatus.ahead}</span>}
            {gitStatus.behind > 0 && <span title="받을 커밋">↓{gitStatus.behind}</span>}
          </>
        )}
        actions={(needsSync || syncing) && (
          <button
            type="button"
            aria-label="동기화"
            title={syncing ? "동기화하는 중…" : syncTitle}
            disabled={gitBusy !== null}
            onClick={() => void syncGit()}
            className="flex size-6 shrink-0 items-center justify-center rounded text-foreground hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
          </button>
        )}
        menu={[
          { hint: true, label: root ?? "작업 폴더를 골라 주세요", onSelect: () => {} },
          { label: gitOpen ? "Git 화면 닫기" : isRepo ? "Git 화면 열기 (기록·커밋·충돌)" : "Git 시작하기", icon: <GitBranch className="size-3.5" />, onSelect: () => useUiStore.getState().toggleGit() },
          ...(isRepo && gitStatus?.hasRemote ? [{ label: "지금 동기화 (커밋 → 가져오기 → 푸시)", icon: <RefreshCw className="size-3.5" />, disabled: gitBusy !== null, onSelect: () => void syncGit() }] : []),
          { label: "Git 설정 (자동 커밋·푸시)", icon: <Settings2 className="size-3.5" />, onSelect: () => useUiStore.getState().setSettingsOpen(true) },
          { label: "작업 폴더 바꾸기", icon: <FolderOpen className="size-3.5" />, onSelect: () => void chooseFolder() },
        ]}
      />
      {open && <NoteTree />}
    </section>
  );
}
