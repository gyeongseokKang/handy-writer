import { create } from "zustand";

/** 명령 팔레트(`>`)와 단축키 안내가 함께 쓰는 명령 하나 */
export interface Command {
  id: string;
  title: string;
  /** 묶음 이름 (예: 글, 탭, 보기) */
  group: string;
  /** "Mod+Shift+H"처럼 적는다. Mod는 맥에서 ⌘, 그 밖에서 Ctrl */
  shortcut?: string;
  /** 찾을 때 같이 보는 말 */
  keywords?: string[];
  /** 지금 쓸 수 없으면 false (목록에서 흐리게) */
  enabled?: () => boolean;
  run: () => void;
}

interface CommandState {
  commands: Command[];
  setCommands: (commands: Command[]) => void;
}

/** 앱 화면(app-shell)이 명령을 등록하고, 검색 창과 단축키 안내가 읽는다. */
export const useCommandStore = create<CommandState>((set) => ({
  commands: [],
  setCommands: (commands) => set({ commands }),
}));
