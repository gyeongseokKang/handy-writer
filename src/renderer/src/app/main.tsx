import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { startGitSync } from "@/entities/git/model/use-git-store";
import { startTemplateSync } from "@/entities/template/model/use-template-store";
import { startTemplateRunSync } from "@/features/templates/model/use-template-run";
import { startAiSync } from "@/features/ai/model/use-ai-store";
import { startIndexSync } from "@/entities/note-index/model/use-note-index-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

import "./index.css";

function App() {
  useEffect(() => {
    const init = useWorkspaceStore.getState().init();
    const stopIndexSync = startIndexSync();
    const stopAiSync = startAiSync();
    const stopGitSync = startGitSync();
    const stopTemplateSync = startTemplateSync();
    const stopTemplateRunSync = startTemplateRunSync();
    return () => {
      stopIndexSync();
      stopAiSync();
      stopGitSync();
      stopTemplateSync();
      stopTemplateRunSync();
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
