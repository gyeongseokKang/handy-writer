import { CodeBlockLowlight, type CodeBlockLowlightOptions } from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { CodeBlockView } from "../ui/code-block-view";
import { lowlight } from "./lowlight";

interface CodeBlockOptions extends CodeBlockLowlightOptions {
  /** false면 머리줄 없이 문서로만 다룬다 (테스트용) */
  renderView: boolean;
}

/** 문법 색을 입히고, 언어 이름과 복사 버튼이 있는 머리줄을 단 코드블록 */
export const CodeBlock = CodeBlockLowlight.extend<CodeBlockOptions>({
  addOptions() {
    return { ...this.parent!(), lowlight, defaultLanguage: null, renderView: true };
  },

  addNodeView() {
    return this.options.renderView ? ReactNodeViewRenderer(CodeBlockView) : null;
  },
});
