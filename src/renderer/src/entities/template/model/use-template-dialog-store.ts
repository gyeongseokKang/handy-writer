import { create } from "zustand";

export type TemplateDialogRequest =
  /** 새 블록을 만든다 */
  | { mode: "new"; templateId: string }
  /** 이미 있는 블록을 같은 입력값으로 다시 생성한다 */
  | { mode: "regenerate"; uid: string }
  /** 템플릿 자체를 만들거나 고친다 (templateId가 null이면 새 템플릿) */
  | { mode: "edit"; templateId: string | null };

interface DialogState {
  request: TemplateDialogRequest | null;
  openNew: (templateId: string) => void;
  openRegenerate: (uid: string) => void;
  openEdit: (templateId: string | null) => void;
  close: () => void;
}

/** 에디터(슬래시 메뉴, 블록의 버튼)와 템플릿 창이 서로를 몰라도 되도록 사이에 두는 스토어 */
export const useTemplateDialogStore = create<DialogState>((set) => ({
  request: null,
  openNew: (templateId) => set({ request: { mode: "new", templateId } }),
  openRegenerate: (uid) => set({ request: { mode: "regenerate", uid } }),
  openEdit: (templateId) => set({ request: { mode: "edit", templateId } }),
  close: () => set({ request: null }),
}));
