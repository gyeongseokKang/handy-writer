import { createRequire } from "node:module";

import type { OnlineTypo } from "../../shared/online-spell";
import type { SpellTransport } from "./online-speller";

type Hanspell = typeof import("hanspell");

const TIMEOUT_MS = 8000;

// hanspell은 CommonJS 패키지다. 실행 환경과 상관없이 불러올 수 있도록 require로 읽는다.
const hanspell = createRequire(import.meta.url)("hanspell") as Hanspell;

/**
 * hanspell(다음·네이버 웹 서비스를 이용)을 Promise로 감싼다.
 * 긴 글은 hanspell이 나눠서 보내고 조각마다 결과를 부르므로 모아서 돌려준다.
 * 일부 조각만 실패하면 받은 결과만 쓰고, 전부 실패하면 던진다.
 */
function wrap(run: (sentence: string, timeout: number, check: (typos: OnlineTypo[]) => void, end: () => void, error: (e: unknown) => void) => void) {
  return (text: string) =>
    new Promise<OnlineTypo[]>((resolve, reject) => {
      const typos: OnlineTypo[] = [];
      let failure: unknown = null;
      run(
        text,
        TIMEOUT_MS,
        (found) => typos.push(...found),
        () => (failure && typos.length === 0 ? reject(failure) : resolve(typos)),
        (e) => (failure ??= e),
      );
    });
}

export const hanspellTransport: SpellTransport = {
  daum: wrap((s, t, c, e, err) => hanspell.spellCheckByDAUM(s, t, c as never, e, err)),
  naver: wrap((s, t, c, e, err) => hanspell.spellCheckByNAVER(s, t, c as never, e, err)),
};
