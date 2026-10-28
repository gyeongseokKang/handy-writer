// 태그의 릴리스 노트를 만든다: 지난 태그 다음부터 이 태그까지의 커밋 제목 (버전만 올린 커밋은 뺀다).
// 쓰임: node scripts/release-notes.mjs v0.1.6
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const tag = process.argv[2];
if (!tag) {
  console.error("태그를 넘겨 주세요 (예: v0.1.6)");
  process.exit(1);
}

let previous = "";
try {
  previous = git("describe", "--tags", "--abbrev=0", "--match", "v*", `${tag}^`);
} catch {
  // 첫 태그면 처음부터의 커밋을 쓴다.
}

const range = previous ? `${previous}..${tag}` : tag;
const subjects = git("log", "--no-merges", "--format=%s", range)
  .split("\n")
  .filter((subject) => subject && !/^v?\d+\.\d+\.\d+$/.test(subject));

const repo = process.env.GITHUB_REPOSITORY ?? "gyeongseokKang/handy-writer";
const lines = ["## 바뀐 점", "", ...(subjects.length ? subjects.map((subject) => `- ${subject}`) : ["- 자잘한 수정"])];
if (previous) lines.push("", `**Full Changelog**: https://github.com/${repo}/compare/${previous}...${tag}`);
console.log(lines.join("\n"));
