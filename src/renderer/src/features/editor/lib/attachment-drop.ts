import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { isAttachableFile, saveFilesAndInsert } from "@/entities/note/model/attach-files";

/** 이미지, 영상 등을 붙여넣거나 끌어다 놓으면 attachments/ 에 저장하고 그 자리에 임베드를 넣는다. */
export const AttachmentDrop = Extension.create({
  name: "attachmentDrop",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("attachmentDrop"),
        props: {
          handlePaste: (_view, event) => {
            const files = [...(event.clipboardData?.files ?? [])].filter(isAttachableFile);
            if (files.length === 0) return false;
            event.preventDefault();
            void saveFilesAndInsert(files);
            return true;
          },
          handleDrop: (view, event) => {
            const files = [...(event.dataTransfer?.files ?? [])].filter(isAttachableFile);
            if (files.length === 0) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            void saveFilesAndInsert(files, pos);
            return true;
          },
        },
      }),
    ];
  },
});
