import { execFile } from "node:child_process";
import { delimiter } from "node:path";

import {
  dashboardPostState, parseGitHubRemote, summarizeChecks, REVIEWS_DIR,
  type BuildResult, type DeployProviderInfo, type ReviewDashboard, type ReviewDashboardCommit, type ReviewDashboardPost,
} from "../../shared/review";
import { slugOfReviewPath } from "../../shared/review-note";
import { runGit } from "../git/runner";
import { loginShellPath } from "../shell-env";
import { checkReviewNotes } from "./review-note-service";
import { deployStatus, listPosts } from "./review-service";

const COMMIT_LIMIT = 20;
/** 빌드 결과를 물어볼 최근 커밋 수 (gh 호출 수를 줄인다) */
const BUILD_CHECK_LIMIT = 6;

const US = "\x1f";
const RS = "\x1e";

/** 원격 main 기준으로 리뷰 글 경로마다 마지막으로 바꾼 커밋 */
export function parsePathLog(out: string): Map<string, { sha: string; date: string }> {
  const map = new Map<string, { sha: string; date: string }>();
  for (const chunk of out.split(RS)) {
    const [head, ...files] = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!head) continue;
    const [sha, date] = head.split(US);
    if (!sha || !date) continue;
    for (const f of files) if (!map.has(f)) map.set(f, { sha, date });
  }
  return map;
}

export function parseCommitLog(out: string): { sha: string; subject: string; date: string }[] {
  return out.split("\n").filter(Boolean).map((line) => {
    const [sha = "", subject = "", date = ""] = line.split(US);
    return { sha, subject, date };
  }).filter((c) => c.sha);
}

function gh(args: string[]): Promise<string> {
  return loginShellPath().then((login) => new Promise((resolve, reject) => {
    const PATH = [process.env["PATH"] ?? "", login].filter(Boolean).join(delimiter);
    execFile("gh", args, { timeout: 10_000, env: { ...process.env, PATH, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" }, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error); else resolve(stdout);
    });
  }));
}

/**
 * 저장소가 private이라 GitHub 빌드 결과는 이 컴퓨터의 gh 로그인으로 읽는다.
 * gh가 없거나 로그인 안 했으면 null (대시보드는 배포 버전 비교만 보여 준다).
 */
async function buildResults(owner: string, repo: string, shas: string[]): Promise<Map<string, { build: BuildResult; url: string | null }> | null> {
  const out = new Map<string, { build: BuildResult; url: string | null }>();
  for (const [i, sha] of shas.entries()) {
    try {
      const runs = JSON.parse(await gh(["api", `repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=50`])) as { check_runs?: Parameters<typeof summarizeChecks>[0] };
      let summary = summarizeChecks(runs.check_runs ?? []);
      if (!summary) {
        // 체크 대신 커밋 상태(status)로 알리는 연동도 있다.
        const combined = JSON.parse(await gh(["api", `repos/${owner}/${repo}/commits/${sha}/status`])) as { statuses?: { state?: string; target_url?: string | null }[] };
        summary = summarizeChecks((combined.statuses ?? []).map((s) => ({
          status: s.state === "pending" ? "in_progress" : "completed",
          conclusion: s.state === "success" ? "success" : "failure",
          details_url: s.target_url ?? null,
        })));
      }
      if (summary) out.set(sha, summary);
    } catch {
      // 첫 호출부터 안 되면 gh를 못 쓰는 것으로 본다. 중간에 하나만 실패하면 그 커밋만 건너뛴다.
      if (i === 0) return null;
    }
  }
  return out;
}

export async function reviewDashboard(root: string | null, repo: string, info: DeployProviderInfo | null): Promise<ReviewDashboard> {
  const git = async (args: string[]) => { try { return (await runGit(repo, args, { readOnly: true, timeoutMs: 30_000 })).stdout; } catch { return null; } };
  const status = await deployStatus(repo, info); // 원격을 받아 온다

  const pending = new Set<string>();
  if (status.deployedSha && status.remoteSha) {
    for (const sha of ((await git(["rev-list", `${status.deployedSha}..${status.remoteSha}`])) ?? "").split("\n")) if (sha.trim()) pending.add(sha.trim());
  }
  const deployedOf = (sha: string) => (status.deployedSha && status.remoteSha ? !pending.has(sha) : null);

  const commitsRaw = parseCommitLog((await git(["log", `-${COMMIT_LIMIT}`, `--format=%H${US}%s${US}%cI`, "@{upstream}"])) ?? "");
  let buildCheck: ReviewDashboard["buildCheck"] = "unavailable";
  let builds: Awaited<ReturnType<typeof buildResults>> = null;
  const remote = parseGitHubRemote((await git(["remote", "get-url", "origin"])) ?? "");
  if (remote && commitsRaw.length > 0) {
    builds = await buildResults(remote.owner, remote.repo, commitsRaw.slice(0, BUILD_CHECK_LIMIT).map((c) => c.sha));
    if (builds) buildCheck = "gh";
  }
  const commits: ReviewDashboardCommit[] = commitsRaw.map((c) => ({
    ...c, deployed: deployedOf(c.sha), build: builds?.get(c.sha)?.build ?? null, buildUrl: builds?.get(c.sha)?.url ?? null,
  }));

  // 리뷰 글마다 원격의 마지막 커밋, 이 컴퓨터에만 있는 변경
  const lastCommit = parsePathLog((await git(["-c", "core.quotePath=false", "log", `--format=${RS}%H${US}%cI`, "--name-only", "@{upstream}", "--", REVIEWS_DIR])) ?? "");
  const localOnly = new Set<string>();
  for (const line of ((await git(["-c", "core.quotePath=false", "log", "--format=", "--name-only", "@{upstream}..HEAD", "--", REVIEWS_DIR])) ?? "").split("\n")) if (line.trim()) localOnly.add(line.trim());
  for (const line of ((await git(["-c", "core.quotePath=false", "status", "--porcelain", "--untracked-files=all", "--", REVIEWS_DIR])) ?? "").split("\n")) {
    const file = line.slice(3).trim().replace(/^"|"$/g, "");
    if (file) localOnly.add(file.includes(" -> ") ? file.split(" -> ")[1]! : file);
  }

  const repoPosts = await listPosts(repo);
  const byPath = new Map(repoPosts.map((p) => [p.path, p]));
  const notes = root ? await checkReviewNotes(root, repo) : [];
  const posts: ReviewDashboardPost[] = [];
  const seen = new Set<string>();
  const describe = (postPath: string | null) => {
    const commit = postPath ? lastCommit.get(postPath) ?? null : null;
    const onRemote = !!commit && !!postPath && !localOnly.has(postPath);
    return { commit, onRemote, deployed: commit ? deployedOf(commit.sha) : null };
  };

  for (const n of notes) {
    const postPath = n.meta.published && byPath.has(n.meta.published) ? n.meta.published : null;
    if (postPath) seen.add(postPath);
    const { commit, onRemote, deployed } = describe(postPath);
    posts.push({
      title: n.title, category: n.meta.category, notePath: n.notePath, postPath, slug: postPath ? slugOfReviewPath(postPath) : null,
      state: dashboardPostState({ hasNote: true, inRepo: !!postPath, problems: n.problems.length, differs: n.differs, onRemote, deployed }),
      problems: n.problems, commitSha: commit?.sha ?? null, commitDate: commit?.date ?? null,
    });
  }
  for (const p of repoPosts) {
    if (seen.has(p.path)) continue;
    const { commit, onRemote, deployed } = describe(p.path);
    posts.push({
      title: p.title, category: p.category, notePath: null, postPath: p.path, slug: slugOfReviewPath(p.path),
      state: dashboardPostState({ hasNote: false, inRepo: true, problems: 0, differs: false, onRemote, deployed }),
      problems: [], commitSha: commit?.sha ?? null, commitDate: commit?.date ?? null,
    });
  }
  return { status, siteUrl: info?.siteUrl ?? null, commits, posts, buildCheck };
}
