/** 작업 폴더 기준 경로를 컴퓨터 전체 경로로 바꾼다. 윈도우 작업 폴더면 \로 잇는다. */
export function absolutePath(root: string, relative: string) {
  const windows = /^[A-Za-z]:\\|^\\\\/.test(root) || (root.includes("\\") && !root.includes("/"));
  const sep = windows ? "\\" : "/";
  const base = root.replace(/[\\/]+$/, "");
  return relative ? `${base}${sep}${windows ? relative.replace(/\//g, "\\") : relative}` : base;
}
