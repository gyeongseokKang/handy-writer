import type { Editor } from "@tiptap/core";
import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";

import { collectSentences, type Sentence } from "./sentences";

const RATE_KEY = "handy-writer.read-aloud-rate";
export const RATES = [0.8, 1, 1.2, 1.5, 1.8] as const;
const HIGHLIGHT = "read-aloud";

interface Controller {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  step: (delta: number) => void;
  /** 지금 문장을 처음부터 다시 읽는다 (속도를 바꿨을 때) */
  restart: () => void;
}

interface ReadAloudState {
  active: boolean;
  paused: boolean;
  /** 지금 읽는 문장 (0부터) */
  index: number;
  total: number;
  /** 선택한 부분만 읽는지 */
  selection: boolean;
  rate: number;
  controller: Controller | null;
  setRate: (rate: number) => void;
}

function savedRate() {
  try {
    const value = Number(localStorage.getItem(RATE_KEY));
    return RATES.includes(value as (typeof RATES)[number]) ? value : 1;
  } catch {
    return 1;
  }
}

export const useReadAloud = create<ReadAloudState>((set) => ({
  active: false,
  paused: false,
  index: 0,
  total: 0,
  selection: false,
  rate: savedRate(),
  controller: null,
  setRate: (rate) => {
    set({ rate });
    try {
      localStorage.setItem(RATE_KEY, String(rate));
    } catch {
      // 저장하지 못해도 이번에는 그 속도로 읽는다.
    }
  },
}));

function voiceFor(lang: "ko" | "en") {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const match = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase().startsWith(lang);
  return voices.find((v) => match(v) && v.localService) ?? voices.find(match) ?? null;
}
const koreanVoice = () => voiceFor("ko");

/** 한글이 하나도 없고 로마자가 있는 문장은 영어 음성으로 읽는다 (한국어 음성은 영어를 어색하게 읽는다). */
export function sentenceLang(text: string): "ko" | "en" {
  return !/[\u3131-\u318e\uac00-\ud7a3]/.test(text) && /[A-Za-z]/.test(text) ? "en" : "ko";
}

/**
 * 글 칸의 에디터를 소리 내어 읽게 한다. 한 문장씩 시스템 음성(speechSynthesis)으로 읽고, 읽는 문장을 칠하고 화면에 보이게 한다.
 * 선택한 글이 있으면 그 부분만, 없으면 커서가 있는 문단부터 끝까지 읽는다. 읽는 중에 글을 고쳐도 남은 문장 위치를 따라간다.
 */
export function useReadAloudEditor(editor: Editor | null, enabled: boolean) {
  useEffect(() => {
    if (!editor || !enabled) return;
    let sentences: Sentence[] = [];
    let index = 0;
    /** 읽기를 새로 시작하거나 멈출 때마다 늘려서, 지난 문장의 끝 알림을 무시한다 */
    let seq = 0;
    /** 크롬은 읽는 중인 utterance를 붙잡아 두지 않으면 끝 알림을 잃는다 */
    let current: SpeechSynthesisUtterance | null = null;

    const clearHighlight = () => {
      try {
        CSS.highlights?.delete(HIGHLIGHT);
      } catch {
        // 칠하기를 지원하지 않으면 그냥 둔다.
      }
    };
    const highlight = (sentence: Sentence) => {
      try {
        const range = document.createRange();
        const start = editor.view.domAtPos(sentence.from);
        const end = editor.view.domAtPos(sentence.to);
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        CSS.highlights?.set(HIGHLIGHT, new Highlight(range));
        // 읽는 문장이 화면 밖이면 위쪽 3분의 1쯤으로 데려온다.
        const scroller = editor.view.dom.closest<HTMLElement>("[data-note-scroller]");
        const rect = range.getBoundingClientRect();
        if (scroller && rect.height) {
          const box = scroller.getBoundingClientRect();
          if (rect.top < box.top + 40 || rect.bottom > box.bottom - 80) scroller.scrollBy({ top: rect.top - box.top - box.height / 3, behavior: "smooth" });
        }
      } catch {
        // 위치를 못 찾으면 칠하지 않고 읽기만 한다.
      }
    };

    const finish = () => {
      seq++;
      current = null;
      window.speechSynthesis?.cancel();
      clearHighlight();
      useReadAloud.setState({ active: false, paused: false, index: 0, total: 0 });
    };

    const speakAt = (i: number) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        toast.error("이 환경에서는 소리 내어 읽기를 쓸 수 없어요.");
        return finish();
      }
      if (i >= sentences.length) return finish();
      index = Math.max(0, i);
      const sentence = sentences[index]!;
      useReadAloud.setState({ index, paused: false });
      highlight(sentence);
      const text = editor.state.doc.textBetween(sentence.from, sentence.to, " ");
      const utterance = new SpeechSynthesisUtterance(text);
      const lang = sentenceLang(text);
      utterance.lang = lang === "en" ? "en-US" : "ko-KR";
      const voice = voiceFor(lang);
      if (voice) utterance.voice = voice;
      utterance.rate = useReadAloud.getState().rate;
      const token = ++seq;
      utterance.onend = () => {
        if (token === seq) speakAt(index + 1);
      };
      utterance.onerror = (event) => {
        if (token !== seq || event.error === "interrupted" || event.error === "canceled") return;
        toast.error(`소리 내어 읽지 못했어요: ${event.error}`);
        finish();
      };
      current = utterance;
      synth.cancel();
      synth.speak(utterance);
    };

    const controller: Controller = {
      start: () => {
        const { doc, selection } = editor.state;
        const partial = !selection.empty;
        // 선택이 없으면 커서가 있는 문단의 처음부터 (커서가 글 맨 앞이면 글 전체)
        const from = partial ? selection.from : selection.from <= 2 ? 0 : selection.$from.start();
        const to = partial ? selection.to : doc.content.size;
        sentences = collectSentences(doc, from, to);
        if (sentences.length === 0) return void toast.error(partial ? "선택한 부분에 읽을 글이 없어요." : "읽을 글이 없어요.");
        if (!koreanVoice() && (window.speechSynthesis?.getVoices().length ?? 0) > 0) {
          toast.warning("한국어 음성을 찾지 못해 기본 음성으로 읽어요. 시스템 설정의 읽기 및 말하기에서 한국어 음성을 받을 수 있어요.");
        }
        useReadAloud.setState({ active: true, total: sentences.length, selection: partial });
        speakAt(0);
      },
      stop: finish,
      pause: () => {
        if (!useReadAloud.getState().active) return;
        seq++;
        window.speechSynthesis?.cancel();
        useReadAloud.setState({ paused: true });
      },
      // 다시 들으면 멈춘 문장의 처음부터 읽는다.
      resume: () => speakAt(index),
      step: (delta) => speakAt(Math.min(sentences.length - 1, Math.max(0, index + delta))),
      restart: () => {
        const { active, paused } = useReadAloud.getState();
        if (active && !paused) speakAt(index);
      },
    };

    // 읽는 중에 글을 고치면 남은 문장의 위치를 옮긴다.
    const onTransaction = ({ transaction }: { transaction: import("@tiptap/pm/state").Transaction }) => {
      if (!transaction.docChanged || !useReadAloud.getState().active) return;
      sentences = sentences.map((s) => ({ from: transaction.mapping.map(s.from, 1), to: transaction.mapping.map(s.to, -1) }));
      const now = sentences[index];
      if (now && now.to > now.from) highlight(now);
    };
    editor.on("transaction", onTransaction);
    useReadAloud.setState({ controller });
    return () => {
      editor.off("transaction", onTransaction);
      if (useReadAloud.getState().controller === controller) {
        if (useReadAloud.getState().active) finish();
        useReadAloud.setState({ controller: null });
      }
      // 붙잡아 둔 utterance를 놓는다.
      current = null;
    };
  }, [editor, enabled]);
}
