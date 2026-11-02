import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { startGitSync } from "@/entities/git/model/use-git-store";
import { startUpdateSync } from "@/entities/update/model/use-update-store";
import { startTemplateSync } from "@/entities/template/model/use-template-store";
import { startTemplateRunSync } from "@/features/templates/model/use-template-run";
import { startDraftRunSync } from "@/features/draft/model/use-draft-run";
import { startLogSync } from "@/entities/log/model/use-log-store";
import { startAiSync } from "@/features/ai/model/use-ai-store";
import { startIndexSync } from "@/entities/note-index/model/use-note-index-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

// Pretendard(가변 굵기, 쓰는 글자만 받아 오는 나눈 파일)를 앱에 함께 묶는다. 인터넷 없이도 같은 글꼴이다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./index.css";

function App() {
  useEffect(() => {
    // 시작하면서 생긴 오류도 모이도록 가장 먼저 시작한다.
    const stopLogSync = startLogSync();
    const init = useWorkspaceStore.getState().init();
    const stopIndexSync = startIndexSync();
    const stopAiSync = startAiSync();
    const stopGitSync = startGitSync();
    const stopTemplateSync = startTemplateSync();
    const stopTemplateRunSync = startTemplateRunSync();
    const stopDraftRunSync = startDraftRunSync();
    const stopUpdateSync = startUpdateSync();
    return () => {
      stopLogSync();
      stopIndexSync();
      stopAiSync();
      stopGitSync();
      stopTemplateSync();
      stopTemplateRunSync();
      stopDraftRunSync();
      stopUpdateSync();
      void init.then((unsubscribe) => unsubscribe());
    };
  }, []);

  return (
    <>
      <AppShell />
      <Toaster position="bottom-right" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
