import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { startIndexSync } from "@/entities/note-index/model/use-note-index-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

import "./index.css";

function App() {
  useEffect(() => {
    const init = useWorkspaceStore.getState().init();
    const stopIndexSync = startIndexSync();
    return () => {
      stopIndexSync();
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
