type Flusher = () => Promise<void>;

const flushers = new Map<string, Flusher>();
/** 글 경로 → 아직 디스크에 쓰지 못한 내용이 있는지 (저장 실패, 충돌) */
const unsavedChecks = new Map<string, () => boolean>();

/**
 * 열려 있는 글이 저장 대기 중인 내용을 즉시 쓰는 함수를 등록한다. 해제 함수를 돌려준다.
 * isUnsaved를 주면 창을 닫을 때 저장하지 못한 글을 알려 주는 데 쓴다.
 */
export function registerFlusher(path: string, flush: Flusher, isUnsaved?: () => boolean) {
  flushers.set(path, flush);
  if (isUnsaved) unsavedChecks.set(path, isUnsaved);
  return () => {
    if (flushers.get(path) === flush) flushers.delete(path);
    if (unsavedChecks.get(path) === isUnsaved) unsavedChecks.delete(path);
  };
}

export async function flushPath(path: string | null) {
  if (path) await flushers.get(path)?.();
}

export async function flushAll() {
  await Promise.all([...flushers.values()].map((flush) => flush().catch(() => {})));
}

/** 저장하지 못한 내용이 남은 글의 경로 */
export function unsavedPaths() {
  return [...unsavedChecks].filter(([, check]) => check()).map(([path]) => path);
}
