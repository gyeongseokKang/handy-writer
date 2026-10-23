import type { HandyApi } from "../shared/types";

declare global {
  interface Window {
    api?: HandyApi;
  }
}
