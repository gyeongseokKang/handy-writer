import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Camera, Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";

import { captureElement } from "../lib/capture-element";
import { lowlight } from "../lib/lowlight";

const LANGUAGES = lowlight.listLanguages().filter((name) => name !== "plaintext");

/** 코드블록의 화면. 머리줄에서 언어를 바꾸고 코드를 복사한다. */
export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language = (node.attrs["language"] as string | null) ?? "";
  const [copied, setCopied] = useState(false);
  const [shooting, setShooting] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
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

  /** 코드블록을 보이는 그대로 찍어 PNG로 저장하고 클립보드에도 넣는다. */
  const screenshot = async () => {
    const block = blockRef.current;
    if (!block || shooting) return;
    setShooting(true);
    try {
      const image = await captureElement(block);
      const note = (useWorkspaceStore.getState().activePath ?? "").split("/").pop()?.replace(/\.md$/, "") || "코드";
      const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
      const { path } = await api.export.saveImage(image, `${note} 코드 ${stamp}.png`);
      if (path) toast.success("스크린샷을 저장했어요. 클립보드에도 넣었어요.", { action: { label: "Finder에서 보기", onClick: () => void api.export.reveal(path) } });
    } catch (error) {
      toast.error(`스크린샷을 찍지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setShooting(false);
    }
  };

  return (
    <NodeViewWrapper ref={blockRef} className="code-block">
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
        <button type="button" className="code-block-copy" aria-label="코드 스크린샷" title="보이는 그대로 찍어 PNG로 저장하고 클립보드에도 넣어요" disabled={shooting} onClick={() => void screenshot()}>
          {shooting ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          스크린샷
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<"code"> as="code" className={language ? `hljs language-${language}` : "hljs"} />
      </pre>
    </NodeViewWrapper>
  );
}
