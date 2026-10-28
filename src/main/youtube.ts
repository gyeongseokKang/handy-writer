import { pickCaptionTrack, youtubeVideoId, type YoutubeSource } from "../shared/draft-sources";

// 유튜브 앱이 쓰는 내부 API로 영상 정보와 자막 목록을 받는다. 웹 페이지와 달리 쿠키 동의 화면이나
// 자바스크립트 실행 없이 바로 JSON이 온다.
const PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const CLIENT = { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "ko", gl: "KR" };
const USER_AGENT = `com.google.android.youtube/${CLIENT.clientVersion} (Linux; U; Android 14) gzip`;
const TIMEOUT_MS = 20_000;

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { videoId?: string; title?: string; author?: string; lengthSeconds?: string; shortDescription?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{ baseUrl?: string; languageCode?: string; kind?: string; name?: { simpleText?: string; runs?: Array<{ text?: string }> } }>;
    };
  };
}

interface Json3 {
  events?: Array<{ segs?: Array<{ utf8?: string }> }>;
}

/** json3 자막을 한 덩어리 글로. 줄바꿈과 겹친 공백을 정리한다. */
export function json3ToText(data: Json3): string {
  return (data.events ?? [])
    .map((event) => (event.segs ?? []).map((seg) => seg.utf8 ?? "").join(""))
    .join(" ")
    .replace(/\[(?:음악|박수|웃음|Music|Applause|Laughter)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Fetch = typeof fetch;

async function getJson<T>(fetcher: Fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`유튜브가 응답하지 않아요 (${response.status}).`);
  return (await response.json()) as T;
}

/** 유튜브 주소로 영상 제목, 채널, 설명, 자막을 받는다. */
export async function fetchYoutube(url: string, fetcher: Fetch = fetch): Promise<YoutubeSource> {
  const videoId = youtubeVideoId(url);
  if (!videoId) throw new Error("유튜브 영상 주소가 아니에요.");

  let player: PlayerResponse;
  try {
    player = await getJson<PlayerResponse>(fetcher, PLAYER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify({ videoId, context: { client: CLIENT } }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.startsWith("유튜브") ? message : "유튜브에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }

  const status = player.playabilityStatus?.status;
  if (status && status !== "OK") {
    throw new Error(`이 영상은 불러올 수 없어요${player.playabilityStatus?.reason ? `: ${player.playabilityStatus.reason}` : "."}`);
  }
  const details = player.videoDetails ?? {};

  const tracks = (player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [])
    .filter((track) => track.baseUrl && track.languageCode)
    .map((track) => ({
      baseUrl: track.baseUrl!,
      languageCode: track.languageCode!,
      kind: track.kind,
      label: track.name?.simpleText ?? track.name?.runs?.map((run) => run.text ?? "").join("") ?? track.languageCode!,
    }));
  const track = pickCaptionTrack(tracks);

  let transcript = "";
  if (track) {
    const captionUrl = new URL(track.baseUrl);
    captionUrl.searchParams.set("fmt", "json3");
    // 자막을 못 받아도 제목과 설명만으로 쓸 수 있게 오류를 삼킨다.
    transcript = await getJson<Json3>(fetcher, captionUrl.toString())
      .then(json3ToText)
      .catch(() => "");
  }

  return {
    kind: "youtube",
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: details.title ?? "제목 없는 영상",
    channel: details.author ?? "",
    seconds: Number(details.lengthSeconds ?? 0) || 0,
    description: details.shortDescription ?? "",
    transcript,
    captionLabel: transcript && track ? track.label : "",
  };
}
