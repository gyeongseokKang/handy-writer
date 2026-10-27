import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { lowlight } from "../lib/lowlight";

const LANGUAGES = lowlight.listLanguages().filter((name) => name !== "plaintext");

/** 코드블록의 화면. 머리줄에서 언어를 바꾸고 코드를 복사한다. */
export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language = (node.attrs["language"] as string | null) ?? "";
  const [copied, setCopied] = useState(false);
  // ```tsx 처럼 별칭으로 적은 언어도 고를 수 있게 목록에 넣는다.
  const options = language && !LANGUAGES.includes(language) ? [language, ...LANGUAGES] : LANGUAGES;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    navigator.clipboard
      .writeText(node.textContent)
      .then(() => setCopied(true))
      .catch(() => toast.error("코드를 복사하지 못했어요."));
  };

  return (
    <NodeViewWrapper className="code-block">
      <div className="code-block-header" contentEditable={false}>
        <select
          value={language}
          aria-label="코드 언어"
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ language: event.target.value || null })}
          className="code-block-language"
        >
          <option value="">일반 텍스트</option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <button type="button" className="code-block-copy" aria-label="코드 복사" title="코드 복사" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<"code"> as="code" className={language ? `hljs language-${language}` : "hljs"} />
      </pre>
    </NodeViewWrapper>
  );
}
