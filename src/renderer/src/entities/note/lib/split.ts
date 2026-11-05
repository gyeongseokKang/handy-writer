/** 분할 화면은 가운데 글을 빼고 최대 2개 (= 최대 3분할) */
export const MAX_SPLITS = 2;

/**
 * 분할 화면 목록에 글을 놓는다. 이미 있으면 자리만 옮기고, 가득 찼으면 그 자리(없으면 맨 오른쪽) 글을 바꾼다.
 * at은 가운데 글 바로 오른쪽이 0.
 */
export function placeSplit(splitPaths: string[], path: string, at?: number): string[] {
  const rest = splitPaths.filter((p) => p !== path);
  if (rest.length >= MAX_SPLITS) {
    const index = Math.min(at ?? rest.length - 1, rest.length - 1);
    return rest.map((p, i) => (i === index ? path : p));
  }
  const index = Math.max(0, Math.min(at ?? rest.length, rest.length));
  return [...rest.slice(0, index), path, ...rest.slice(index)];
}
