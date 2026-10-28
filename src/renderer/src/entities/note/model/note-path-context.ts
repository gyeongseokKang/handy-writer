import { createContext, useContext } from "react";

/**
 * 이 에디터가 편집하는 글의 경로. 분할 화면에서는 에디터가 둘이라
 * 임베드처럼 "이 글이 있는 폴더"가 필요한 곳은 활성 글 대신 이 값을 쓴다.
 */
export const NotePathContext = createContext<string | null>(null);

export const useNotePath = () => useContext(NotePathContext);
