import { watch, type FSWatcher } from "node:fs";

import type { NotesChangedEvent } from "../shared/types";
import { isHiddenPath, toPosix } from "./notes-fs";

const DEBOUNCE_MS = 150;

/** 작업 폴더의 .md 변경을 모아서(debounce) 알려준다. 숨김 폴더(.git 등)는 무시한다. */
export function watchNotes(root: string, onChange: (event: NotesChangedEvent) => void): FSWatcher {
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;

  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const rel = toPosix(filename.toString());
    if (isHiddenPath(rel) || !rel.endsWith(".md")) return;
    pending.add(rel);
    clearTimeout(timer);
    timer = setTimeout(() => {
      onChange({ paths: [...pending] });
      pending.clear();
    }, DEBOUNCE_MS);
  });

  watcher.on("close", () => clearTimeout(timer));
  return watcher;
}
