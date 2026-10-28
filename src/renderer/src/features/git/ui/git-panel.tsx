import type { GitChangeKind } from "@shared/git";
import { ArrowDown, ArrowUp, ArrowDownToLine, ArrowUpFromLine, FolderGit2, GitBranch, GitCommitHorizontal, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { useGitStore } from "@/entities/git/model/use-git-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { Button } from "@/shared/ui/button";

const KIND_LABEL: Record<GitChangeKind, { label: string; className: string }> = {
  modified: { label: "수정", className: "text-amber-600" },
  added: { label: "추가", className: "text-emerald-600" },
  untracked: { label: "새 파일", className: "text-emerald-600" },
  deleted: { label: "삭제", className: "text-red-600" },
  renamed: { label: "이름 변경", className: "text-sky-600" },
  conflicted: { label: "충돌", className: "text-red-600" },
};

const AUTO_COMMIT_OPTIONS = [0, 5, 10, 30, 60];

const fieldClass =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function relativeTime(time: number) {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 p-4 text-sm text-muted-foreground">{children}</div>;
}

function RemoteForm() {
  const setRemote = useGitStore((s) => s.setRemote);
  const busy = useGitStore((s) => s.busy);
  const [url, setUrl] = useState("");
  return (
    <section className="space-y-2 px-4 py-3">
      <h2 className="text-xs font-semibold text-muted-foreground">원격 저장소 연결</h2>
      <p className="text-xs text-muted-foreground">GitHub 등에서 빈 저장소를 만들고 주소를 붙여 넣으세요. (예: git@github.com:이름/vault.git)</p>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="원격 저장소 주소" aria-label="원격 저장소 주소" className={fieldClass} />
      <Button size="sm" disabled={!url.trim() || busy !== null} onClick={() => void setRemote(url).then((ok) => ok && setUrl(""))}>
        연결
      </Button>
    </section>
  );
}

const FORCE = {
  pull: {
    label: "강제 가져오기",
    confirm: "원격으로 덮어쓰기",
    text: "내 컴퓨터의 커밋과 아직 커밋하지 않은 변경을 버리고 원격과 똑같이 맞춰요. 버리기 전 상태는 백업 브랜치에 남겨 둬요.",
  },
  push: {
    label: "강제 푸시",
    confirm: "내 글로 덮어쓰기",
    text: "원격에만 있는 커밋을 지우고 원격을 내 커밋으로 덮어써요. 지워지는 원격 커밋은 내 컴퓨터의 백업 브랜치에 남겨 둬요. 커밋하지 않은 변경은 올라가지 않아요.",
  },
} as const;

/** 가져오기가 충돌하거나 양쪽에 서로 다른 커밋이 있을 때: 한쪽으로 덮어써서 맞춘다. */
function ForceSync() {
  const busy = useGitStore((s) => s.busy);
  const [confirming, setConfirming] = useState<"pull" | "push" | null>(null);
  const run = (kind: "pull" | "push") => {
    setConfirming(null);
    const { forcePull, forcePush } = useGitStore.getState();
    void (kind === "pull" ? forcePull() : forcePush());
  };

  return (
    <section aria-label="충돌 해결" className="space-y-2 px-4 py-3">
      <h2 className="text-xs font-semibold text-muted-foreground">충돌 해결</h2>
      <p className="text-xs text-muted-foreground">합치지 못하면 한쪽으로 덮어써서 맞출 수 있어요.</p>
      {confirming ? (
        <div role="alertdialog" aria-label={`${FORCE[confirming].label} 확인`} className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
          <p>{FORCE[confirming].text}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => run(confirming)}>
              {FORCE[confirming].confirm}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="text-destructive" disabled={busy !== null} onClick={() => setConfirming("pull")}>
            {busy === "force-pull" ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />} {FORCE.pull.label}
          </Button>
          <Button size="sm" variant="outline" className="text-destructive" disabled={busy !== null} onClick={() => setConfirming("push")}>
            {busy === "force-push" ? <Loader2 className="animate-spin" /> : <ArrowUpFromLine />} {FORCE.push.label}
          </Button>
        </div>
      )}
    </section>
  );
}

function Settings() {
  const settings = useGitStore((s) => s.settings);
  const save = useGitStore((s) => s.saveSettings);
  const options = AUTO_COMMIT_OPTIONS.includes(settings.autoCommitMinutes) ? AUTO_COMMIT_OPTIONS : [...AUTO_COMMIT_OPTIONS, settings.autoCommitMinutes].sort((a, b) => a - b);
  const [template, setTemplate] = useState(settings.commitMessage);

  return (
    <details className="px-4 py-3">
      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground select-none">자동화 설정</summary>
      <div className="mt-3 space-y-3 text-sm">
        <label className="flex items-center justify-between gap-2">
          자동 커밋
          <select
            aria-label="자동 커밋 간격"
            value={settings.autoCommitMinutes}
            onChange={(e) => void save({ autoCommitMinutes: Number(e.target.value) })}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            {options.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? "끔" : `${minutes}분마다`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.autoPush} disabled={settings.autoCommitMinutes === 0} onChange={(e) => void save({ autoPush: e.target.checked })} />
          자동 커밋 뒤에 푸시도 하기
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.pullOnStart} onChange={(e) => void save({ pullOnStart: e.target.checked })} />
          앱을 열 때 원격 변경 가져오기
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">자동 커밋 메시지 ({"{date}"}는 날짜와 시각)</span>
          <input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            onBlur={() => template !== settings.commitMessage && void save({ commitMessage: template })}
            aria-label="자동 커밋 메시지"
            className={fieldClass}
          />
        </label>
      </div>
    </details>
  );
}

export function GitPanel() {
  const status = useGitStore((s) => s.status);
  const busy = useGitStore((s) => s.busy);
  const lastConflict = useGitStore((s) => s.conflicted);
  const message = useGitStore((s) => s.commitMessage);
  const setMessage = useGitStore((s) => s.setCommitMessage);
  const { init, commit, pull, push, sync, refresh } = useGitStore.getState();
  const notes = useWorkspaceStore((s) => s.notes);
  const openNote = useWorkspaceStore((s) => s.openNote);

  if (!status) return <Empty>작업 폴더를 선택하면 git 상태를 볼 수 있어요.</Empty>;
  if (!status.installed) {
    return <Empty>컴퓨터에서 git을 찾지 못했어요. git을 설치한 뒤 앱을 다시 열어 주세요.</Empty>;
  }
  if (!status.isRepo) {
    return (
      <Empty>
        <FolderGit2 className="size-6" />
        <p>이 작업 폴더는 아직 git 저장소가 아니에요. 저장소로 만들면 글의 변경 이력을 남기고 GitHub 같은 곳에 백업할 수 있어요.</p>
        <p className="text-xs">이미 Obsidian Git을 쓰는 폴더라면 그대로 선택하면 돼요. 저장소가 있는 폴더는 자동으로 인식해요.</p>
        <Button size="sm" disabled={busy !== null} onClick={() => void init()}>
          git 저장소 만들기
        </Button>
      </Empty>
    );
  }

  const conflicted = status.changes.filter((c) => c.kind === "conflicted");
  const isBusy = busy !== null;
  const noteByPath = new Map(notes.map((n) => [n.path, n]));

  return (
    <div role="region" aria-label="Git" className="flex flex-col divide-y">
      <section className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <GitBranch className="size-4" />
            {status.branch ?? "(분리된 HEAD)"}
          </p>
          <button type="button" title="상태 새로고침" aria-label="상태 새로고침" onClick={() => void refresh()} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <RefreshCw className="size-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {status.upstream ? (
            <>
              {status.upstream} · <ArrowUp className="inline size-3" /> {status.ahead} <ArrowDown className="inline size-3" /> {status.behind}
            </>
          ) : status.hasRemote ? (
            "원격에 아직 이 브랜치가 없어요 (푸시하면 만들어져요)"
          ) : (
            "원격 저장소가 연결되지 않았어요"
          )}
        </p>
        {status.lastCommit && (
          <p className="truncate text-xs text-muted-foreground" title={status.lastCommit.subject}>
            마지막 커밋 {relativeTime(status.lastCommit.time)} · {status.lastCommit.subject}
          </p>
        )}
        {(status.merging || conflicted.length > 0) && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
            병합이 끝나지 않았거나 충돌한 파일이 있어요. 터미널에서 해결(또는 `git merge --abort`)하거나 아래 충돌 해결에서 한쪽으로 덮어써 주세요.
          </p>
        )}
      </section>

      <section className="space-y-2 px-4 py-3">
        <h2 className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          변경된 파일 <span className="font-normal">{status.changes.length}</span>
        </h2>
        {status.changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">변경된 파일이 없어요</p>
        ) : (
          <ul aria-label="변경된 파일" className="max-h-48 overflow-y-auto">
            {status.changes.map((change) => {
              const kind = KIND_LABEL[change.kind];
              const note = noteByPath.get(change.path);
              return (
                <li key={change.path}>
                  <button
                    type="button"
                    disabled={!note}
                    onClick={() => note && void openNote(note.path)}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm enabled:hover:bg-accent/70"
                  >
                    <span className="min-w-0 flex-1 truncate" title={change.path}>
                      {change.path}
                    </span>
                    <span className={`shrink-0 text-xs ${kind.className}`}>{kind.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="커밋 메시지 (비우면 자동으로 만들어요)"
          aria-label="커밋 메시지"
          className={fieldClass}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && !isBusy && void commit()}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" disabled={isBusy || status.changes.length === 0} onClick={() => void commit()}>
            {busy === "commit" ? <Loader2 className="animate-spin" /> : <GitCommitHorizontal />} 커밋
          </Button>
          <Button size="sm" disabled={isBusy || !status.hasRemote} onClick={() => void sync()} title="커밋 → 가져오기 → 푸시">
            {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />} 동기화
          </Button>
          <Button size="sm" variant="outline" disabled={isBusy || !status.hasRemote} onClick={() => void pull()}>
            {busy === "pull" ? <Loader2 className="animate-spin" /> : <ArrowDown />} 가져오기
          </Button>
          <Button size="sm" variant="outline" disabled={isBusy || !status.hasRemote || !status.lastCommit} onClick={() => void push()}>
            {busy === "push" ? <Loader2 className="animate-spin" /> : <ArrowUp />} 푸시
          </Button>
        </div>
      </section>

      {status.hasRemote && (lastConflict || status.merging || conflicted.length > 0 || (status.ahead > 0 && status.behind > 0)) && <ForceSync />}
      {!status.hasRemote && <RemoteForm />}
      <Settings />
    </div>
  );
}
