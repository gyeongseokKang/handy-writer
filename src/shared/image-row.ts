/**
 * 이미지를 나란히 놓은 한 줄(묶음)의 칸 수. 이미지가 너무 작아지지 않게 한 줄에 셋까지 놓고,
 * 넷은 2×2로 나눈다 (3+1로 하나만 외롭게 남는 것을 피한다).
 */
export function rowColumns(count: number) {
  if (count <= 1) return 1;
  if (count === 2 || count === 4) return 2;
  return 3;
}
