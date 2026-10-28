/** 초안 만들기에 붙이는 자료: 유튜브 영상(자막)과 컴퓨터에 있는 프로젝트 폴더 */

export interface YoutubeSource {
  kind: "youtube";
  videoId: string;
  url: string;
  title: string;
  channel: string;
  /** 영상 길이(초) */
  seconds: number;
  description: string;
  /** 자막 글. 자막이 없는 영상이면 빈 문자열 */
  transcript: string;
  /** 자막 언어 이름 (예: "한국어", "영어 (자동 생성됨)") */
  captionLabel: string;
}

export interface ProjectSource {
  kind: "project";
  /** 폴더의 절대 경로 (메인 프로세스가 고른 폴더만 받는다) */
  path: string;
  name: string;
  /** 목록에 보여줄 파일 수 */
  fileCount: number;
}

export type DraftSource = YoutubeSource | ProjectSource;

const MAX_SOURCES = 6;
const MAX_TEXT = 60_000;
/** 프롬프트에 넣는 자막 길이. 긴 영상은 앞에서부터 이만큼만 넣는다. */
export const MAX_TRANSCRIPT_CHARS = 40_000;
const MAX_DESCRIPTION_CHARS = 2_000;

/** 유튜브 주소에서 영상 ID를 읽는다. 유튜브 주소가 아니면 null */
export function youtubeVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** 글 안에서 유튜브 주소를 모두 찾는다 (중복 영상은 한 번만). */
export function findYoutubeUrls(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>()"']+/g)) {
    const id = youtubeVideoId(match[0]);
    if (id && !seen.has(id)) {
      seen.add(id);
      urls.push(match[0]);
    }
  }
  return urls;
}

export interface CaptionTrack {
  languageCode: string;
  /** "asr"이면 자동 생성 자막 */
  kind?: string;
  label: string;
}

/** 쓸 자막 고르기: 직접 만든 한국어 → 직접 만든 영어 → 직접 만든 다른 언어 → 자동 생성 한국어 → 자동 생성 영어 → 나머지 */
export function pickCaptionTrack<T extends CaptionTrack>(tracks: T[]): T | null {
  const lang = (track: T) => track.languageCode.toLowerCase().split("-")[0];
  const manual = tracks.filter((track) => track.kind !== "asr");
  const auto = tracks.filter((track) => track.kind === "asr");
  return (
    manual.find((t) => lang(t) === "ko") ??
    manual.find((t) => lang(t) === "en") ??
    manual[0] ??
    auto.find((t) => lang(t) === "ko") ??
    auto.find((t) => lang(t) === "en") ??
    auto[0] ??
    null
  );
}

/** 렌더러에서 온 자료 목록의 모양을 맞춘다. 프로젝트 경로가 허용된 것인지는 메인이 따로 확인한다. */
export function parseSources(value: unknown): DraftSource[] {
  if (!Array.isArray(value)) return [];
  const str = (x: unknown, max = MAX_TEXT) => (typeof x === "string" ? x.slice(0, max) : "");
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const sources: DraftSource[] = [];
  for (const raw of value.slice(0, MAX_SOURCES)) {
    const v = (raw ?? {}) as Record<string, unknown>;
    if (v["kind"] === "youtube" && youtubeVideoId(str(v["url"]))) {
      sources.push({
        kind: "youtube",
        videoId: str(v["videoId"], 20),
        url: str(v["url"], 500),
        title: str(v["title"], 300),
        channel: str(v["channel"], 200),
        seconds: num(v["seconds"]),
        description: str(v["description"], MAX_DESCRIPTION_CHARS),
        transcript: str(v["transcript"]),
        captionLabel: str(v["captionLabel"], 100),
      });
    } else if (v["kind"] === "project" && str(v["path"])) {
      sources.push({ kind: "project", path: str(v["path"], 1000), name: str(v["name"], 200), fileCount: num(v["fileCount"]) });
    }
  }
  return sources;
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

const attr = (value: string) => value.replace(/["<>\n]/g, " ");

function clip(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max)}\n…(이하 생략)`;
}

/** 유튜브 자막을 프롬프트에 넣을 자료로 만든다. */
export function youtubeSection(source: YoutubeSource) {
  const head = `<youtube title="${attr(source.title)}" channel="${attr(source.channel)}" url="${attr(source.url)}" length="${formatDuration(source.seconds)}">`;
  const parts = [head];
  if (source.description.trim()) parts.push(`<description>\n${clip(source.description.trim(), MAX_DESCRIPTION_CHARS)}\n</description>`);
  parts.push(
    source.transcript.trim()
      ? `<transcript language="${attr(source.captionLabel)}">\n${clip(source.transcript.trim(), MAX_TRANSCRIPT_CHARS)}\n</transcript>`
      : "<transcript>자막이 없는 영상이에요. 제목과 설명만 참고하세요.</transcript>",
  );
  parts.push("</youtube>");
  return parts.join("\n");
}

/** 자료를 어떻게 쓸지 알려 주는 지시 */
export function sourcesInstruction(hasYoutube: boolean, hasProject: boolean) {
  const lines = ["글은 위 자료를 바탕으로 씁니다. 자료에 없는 사실, 수치, 인용은 지어내지 않습니다."];
  if (hasYoutube) {
    lines.push(
      "유튜브 자막은 말을 옮긴 글이라 군더더기와 인식 오류가 있을 수 있어요. 내용을 정리해서 쓰고, 영상 내용을 다룰 때는 출처로 영상 제목과 주소를 밝힙니다. 자막이 다른 언어면 한국어로 옮겨 씁니다.",
    );
  }
  if (hasProject) {
    lines.push(
      "<project>는 컴퓨터에 있는 프로젝트 폴더의 요약이에요. 더 알아야 할 것이 있으면 Read, Glob, Grep 도구로 그 폴더의 파일을 직접 읽어 확인하세요. 파일은 읽기만 하고 고치지 않습니다. 비밀번호, 키, 토큰 같은 값은 글에 옮기지 않습니다.",
    );
  }
  return lines.join("\n");
}
