import type { GitChangeKind, GitFileChange, GitStatus, NoteVersion } from "../../shared/git";

export interface ParsedStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** 저장소 루트 기준 경로 */
  changes: GitFileChange[];
}

function kindOf(xy: string): GitChangeKind {
  if (xy.includes("D")) return "deleted";
  if (xy.includes("A")) return "added";
  if (xy.includes("R") || xy.includes("C")) return "renamed";
  return "modified";
}

/**
 * `git status --porcelain=v2 --branch -z`의 출력을 읽는다.
 * -z라서 한글이나 공백이 들어간 경로도 따옴표 없이 그대로 온다.
 */
export function parseStatusV2(output: string): ParsedStatus {
  const result: ParsedStatus = { branch: null, upstream: null, ahead: 0, behind: 0, changes: [] };
  const tokens = output.split("\0");

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token.startsWith("# ")) {
      const [key, ...rest] = token.slice(2).split(" ");
      const value = rest.join(" ");
      if (key === "branch.head") result.branch = value === "(detached)" ? null : value;
      else if (key === "branch.upstream") result.upstream = value;
      else if (key === "branch.ab") {
        const match = /^\+(\d+) -(\d+)$/.exec(value);
        if (match) {
          result.ahead = Number(match[1]);
          result.behind = Number(match[2]);
        }
      }
    } else if (token.startsWith("1 ")) {
      // 1 XY sub mH mI mW hH hI path
      const parts = token.split(" ");
      result.changes.push({ path: parts.slice(8).join(" "), kind: kindOf(parts[1] ?? "") });
    } else if (token.startsWith("2 ")) {
      // 2 XY sub mH mI mW hH hI Xscore path 다음 토큰이 원래 경로
      const parts = token.split(" ");
      result.changes.push({ path: parts.slice(9).join(" "), kind: "renamed" });
      i++;
    } else if (token.startsWith("u ")) {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path
      result.changes.push({ path: token.split(" ").slice(10).join(" "), kind: "conflicted" });
    } else if (token.startsWith("? ")) {
      result.changes.push({ path: token.slice(2), kind: "untracked" });
    }
  }
  return result;
}

/** 저장소 루트 기준 경로를 작업 폴더 기준으로 바꾼다. 작업 폴더 밖의 경로는 버린다. */
export function relativizeChanges(changes: GitFileChange[], prefix: string): GitFileChange[] {
  if (!prefix) return changes;
  return changes.flatMap((change) => (change.path.startsWith(prefix) ? [{ ...change, path: change.path.slice(prefix.length) }] : []));
}

export function toGitStatus(parsed: ParsedStatus, extra: Pick<GitStatus, "hasRemote" | "merging" | "lastCommit">, prefix: string): GitStatus {
  return {
    installed: true,
    isRepo: true,
    branch: parsed.branch,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    changes: relativizeChanges(parsed.changes, prefix),
    ...extra,
  };
}

/** git이 내는 영어 오류 메시지를 사용자가 할 일을 알려주는 한국어로 바꾼다. */
export function explainGitError(stderr: string): string {
  const text = stderr.trim();
  if (/Authentication failed|could not read Username|could not read Password|terminal prompts disabled|Permission denied \(publickey\)|Host key verification failed/i.test(text)) {
    return "원격 저장소 인증에 실패했어요. 터미널에서 같은 저장소로 `git push`를 한 번 실행해 인증(SSH 키 또는 자격 증명)을 저장해 주세요.";
  }
  if (/Please tell me who you are|unable to auto-detect email|empty ident name/i.test(text)) {
    return '커밋하는 사람 정보가 없어요. 터미널에서 `git config --global user.name "이름"`과 `git config --global user.email "메일"`을 설정해 주세요.';
  }
  if (/non-fast-forward|fetch first|\[rejected\]|failed to push some refs/i.test(text)) {
    return "원격에 내가 가지지 않은 새 변경이 있어요. 먼저 풀(가져오기)을 한 뒤 다시 푸시해 주세요.";
  }
  if (/would be overwritten by merge|Your local changes|commit your changes or stash/i.test(text)) {
    return "저장하지 않은 변경이 있어서 가져올 수 없어요. 먼저 커밋해 주세요.";
  }
  if (/Could not resolve host|unable to access|Connection (timed out|refused)|Network is unreachable/i.test(text)) {
    return "원격 저장소에 연결하지 못했어요. 인터넷 연결과 저장소 주소를 확인해 주세요.";
  }
  if (/does not appear to be a git repository|Repository not found|not found/i.test(text) && /remote|repository/i.test(text)) {
    return "원격 저장소를 찾지 못했어요. 주소가 맞는지, 접근 권한이 있는지 확인해 주세요.";
  }
  return text || "git 명령이 실패했어요.";
}

const RECORD = "\x1e";

/**
 * `git log --follow --name-only -z --format=%x1e%H%x00%ct%x00%an%x00%s`의 출력을 읽는다.
 * 커밋마다 `0x1e 해시 NUL 시각 NUL 작성자 NUL 제목 NUL 줄바꿈 경로 NUL` 순서로 온다.
 * 경로는 그 커밋에서 글이 있던 자리(저장소 루트 기준)라서, 이름을 바꾸기 전 버전도 읽을 수 있다.
 */
export function parseNoteLog(output: string): NoteVersion[] {
  const versions: NoteVersion[] = [];
  for (const record of output.split("\x1e")) {
    const [hash = "", time = "", author = "", subject = "", ...paths] = record.split("\0");
    const blobPath = paths.map((path) => path.replace(/^\n+/, "")).find(Boolean) ?? "";
    if (!/^[0-9a-f]{7,64}$/.test(hash) || !blobPath) continue;
    versions.push({ hash, time: Number(time) * 1000, author, subject, blobPath });
  }
  return versions;
}
