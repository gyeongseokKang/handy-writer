import { create } from "zustand";

interface EditorState {
  title: string;
  content: string;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  title: "",
  content: "",
  setTitle: (title) => set({ title }),
  setContent: (content) => set({ content }),
}));

export function countChars(text: string) {
  return text.replace(/\s/g, "").length;
}
