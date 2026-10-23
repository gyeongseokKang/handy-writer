import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

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
    return () => {
      stopIndexSync();
      stopAiSync();
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
