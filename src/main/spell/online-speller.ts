import type { OnlineSpellResult, OnlineTypo } from "../../shared/online-spell";

/** 다음·네이버 맞춤법 검사기를 부르는 함수. 실패하면 던진다. (테스트에서는 가짜로 바꾼다) */
export interface SpellTransport {
  daum: (text: string) => Promise<OnlineTypo[]>;
  naver: (text: string) => Promise<OnlineTypo[]>;
}

export interface OnlineSpellerOptions {
  transport: SpellTransport;
  /** 인터넷에 연결돼 있는지. false면 서버를 부르지 않고 건너뛴다. */
  isOnline: () => boolean;
  now?: () => number;
  /** 서버가 둘 다 실패하면 이 시간 동안은 부르지 않고 오프라인으로 본다. */
  cooldownMs?: number;
  /** 한 번에 보낼 수 있는 최대 글자 수 */
  maxChars?: number;
}

const DEFAULT_COOLDOWN_MS = 2 * 60_000;
const DEFAULT_MAX_CHARS = 2000;
const HANGUL = /[가-힣]/;

/** 온라인 맞춤법 검사. 오프라인이거나 서버가 응답하지 않으면 조용히 건너뛴다(오류를 사용자에게 보이지 않는다). */
export function createOnlineSpeller({ transport, isOnline, now = Date.now, cooldownMs = DEFAULT_COOLDOWN_MS, maxChars = DEFAULT_MAX_CHARS }: OnlineSpellerOptions) {
  let downUntil = 0;

  return {
    /** 검사를 쉬는 중인지 (서버가 최근에 실패했으면 true) */
    get cooling() {
      return now() < downUntil;
    },

    async check(text: string): Promise<OnlineSpellResult> {
      // 한글이 없는 글은 보낼 이유가 없다.
      if (!HANGUL.test(text)) return { status: "ok", typos: [] };
      if (!isOnline() || now() < downUntil) return { status: "offline", typos: [] };

      const body = text.length > maxChars ? text.slice(0, maxChars) : text;
      try {
        return { status: "ok", typos: await transport.daum(body) };
      } catch {
        // 다음이 안 되면 네이버로 한 번 더 시도한다.
        try {
          return { status: "ok", typos: await transport.naver(body) };
        } catch {
          downUntil = now() + cooldownMs;
          return { status: "offline", typos: [] };
        }
      }
    },
  };
}
