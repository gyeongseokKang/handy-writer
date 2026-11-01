import { Extension } from "@tiptap/core";

import { BLOCK_TYPES } from "./block-types";

/**
 * 블록 종류를 단축키로 바꾼다 (Notion과 같은 번호): `Ctrl/Cmd+Alt+0` 본문, `1~3` 제목, `4` 할 일, `5` 글머리 목록, `6` 번호 목록, `7` 인용, `8` 코드 블록.
 * 기본 제목 단축키(Mod-Alt-1~6)보다 먼저 받아야 4~6이 목록으로 바뀐다.
 */
export const BlockShortcuts = Extension.create({
  name: "blockShortcuts",
  priority: 1000,

  addKeyboardShortcuts() {
    return Object.fromEntries(
      BLOCK_TYPES.map((type) => [
        `Mod-Alt-${type.digit}`,
        () => {
          // 표·콜아웃 같은 블록 안에서는 바꾸지 않고 키를 그대로 둔다.
          if (this.editor.isActive("table") || this.editor.isActive("callout") || this.editor.isActive("templateBlock")) return false;
          return type.set(this.editor);
        },
      ]),
    );
  },
});
