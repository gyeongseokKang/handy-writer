const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const MAC_KEYS: Record<string, string> = { Mod: "⌘", Shift: "⇧", Alt: "⌥", Ctrl: "⌃", Enter: "↩", Backspace: "⌫" };

/** "Mod+Shift+H" → 맥은 "⌘⇧H", 그 밖은 "Ctrl+Shift+H" */
export function shortcutLabel(shortcut: string, mac = isMac) {
  const keys = shortcut.split("+");
  if (mac) return keys.map((k) => MAC_KEYS[k] ?? k).join("");
  return keys.map((k) => (k === "Mod" ? "Ctrl" : k)).join("+");
}

/** 명령 이름을 찾을 때: 띄어쓰기와 대소문자를 무시하고, 낱말마다 들어 있는지 본다. */
export function matchesCommand(query: string, ...texts: string[]) {
  const hay = texts.join(" ").toLowerCase().replace(/\s+/g, "");
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}
