type Flusher = () => Promise<void>;

const flushers = new Map<string, Flusher>();

/** 열려 있는 글이 저장 대기 중인 내용을 즉시 쓰는 함수를 등록한다. 해제 함수를 돌려준다. */
export function registerFlusher(path: string, flush: Flusher) {
  flushers.set(path, flush);
  return () => {
    if (flushers.get(path) === flush) flushers.delete(path);
  };
}

export async function flushPath(path: string | null) {
  if (path) await flushers.get(path)?.();
}

export async function flushAll() {
  await Promise.all([...flushers.values()].map((flush) => flush()));
}
