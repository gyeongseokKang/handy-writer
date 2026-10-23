import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import type { ReactNode } from "react";

import { SuggestionList, type SuggestionListHandle } from "../ui/suggestion-list";

export interface SuggestionItem<T> {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  payload: T;
}

type RenderFn<T> = NonNullable<SuggestionOptions<SuggestionItem<T>, SuggestionItem<T>>["render"]>;

/** `/`나 `[[`로 열리는 팝업 목록을 body에 띄우고 커서 옆에 붙인다. */
export function createSuggestionRender<T>(): RenderFn<T> {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, SuggestionProps<SuggestionItem<T>, SuggestionItem<T>>> | null = null;

    const place = (props: SuggestionProps<SuggestionItem<T>, SuggestionItem<T>>) => {
      const rect = props.clientRect?.();
      const element = renderer?.element as HTMLElement | undefined;
      if (!rect || !element) return;
      void computePosition({ getBoundingClientRect: () => rect }, element, {
        strategy: "fixed",
        placement: "bottom-start",
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
      });
    };

    const destroy = () => {
      renderer?.element.remove();
      renderer?.destroy();
      renderer = null;
    };

    return {
      onStart: (props) => {
        renderer = new ReactRenderer(SuggestionList<T>, { props, editor: props.editor });
        const element = renderer.element as HTMLElement;
        element.style.position = "fixed";
        element.style.zIndex = "50";
        document.body.appendChild(element);
        place(props);
      },
      onUpdate: (props) => {
        renderer?.updateProps(props);
        place(props);
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          destroy();
          return true;
        }
        return renderer?.ref?.onKeyDown(props) ?? false;
      },
      onExit: destroy,
    };
  };
}
