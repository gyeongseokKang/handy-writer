import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { EditorPage } from "@/features/editor/ui/editor-page";

import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EditorPage />
    <Toaster />
  </StrictMode>,
);
