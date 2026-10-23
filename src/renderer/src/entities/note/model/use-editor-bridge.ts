import { create } from "zustand";

/** AI 요청을 보낼 때 에디터에서 읽어 온 값. 적용할 때 원문이 그대로인지 확인하는 데도 쓴다. */
export interface EditorContext {
  noteName: string;
  hasSelection: boolean;
  /** 선택한 글(마크다운). 선택이 없으면 본문 전체 */
  text: string;
  /** 선택 시작(또는 커서) 앞까지의 글(마크다운) */
  before: string;
  from: number;
  to: number;
}

/** 글에 들어 있는 이미지·영상 등 임베드 하나 (패널에서 라벨과 크기를 고친다) */
export interface EmbedItem {
  uid: string;
  target: string;
  label: string;
  width: number | null;
  height: number | null;
  syntax: "wiki" | "markdown";
}

export type EmbedPatch = Partial<Pick<EmbedItem, "label" | "width" | "height">>;

export type ApplyResult = "ok" | "changed";

export interface EditorBridge {
  getContext: () => EditorContext;
  /** 요청할 때의 범위를 새 마크다운으로 바꾼다. 그사이 그 부분이 바뀌었으면 건드리지 않고 "changed"를 돌려준다. */
  replace: (context: EditorContext, markdown: string) => ApplyResult;
  /** 지금 커서가 있는 블록 바로 아래에 새 블록으로 넣는다. */
  insertBelowCursor: (markdown: string) => void;
  listEmbeds: () => EmbedItem[];
  updateEmbed: (uid: string, patch: EmbedPatch) => boolean;
  removeEmbed: (uid: string) => boolean;
  /** 해당 임베드를 선택하고 그 위치로 스크롤한다. */
  focusEmbed: (uid: string) => boolean;
  /** 대상 이름들을 임베드로 삽입한다. pos가 없으면 커서 위치에 넣는다. */
  insertEmbeds: (targets: string[], pos?: number) => void;
  /** 글에서 처음 나오는 단어를 선택하고 그 위치로 스크롤한다. 없으면 false */
  findAndSelect: (term: string) => boolean;
}

interface EditorBridgeState {
  bridge: EditorBridge | null;
  setBridge: (bridge: EditorBridge | null) => void;
}

/** 에디터(features/editor)와 AI 패널(features/ai)이 서로를 몰라도 되도록 사이에 두는 연결점 */
export const useEditorBridge = create<EditorBridgeState>((set) => ({
  bridge: null,
  setBridge: (bridge) => set({ bridge }),
}));
