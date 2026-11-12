"use client";

import { useSyncExternalStore } from "react";

const KEY = "benchdesk-theme";
const EVENT = "benchdesk-theme-change";

// The inline script in layout.tsx sets data-theme from localStorage before
// first paint; this component only reads and updates that attribute.
function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "light") return t === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const value = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem(KEY, value);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button className="ghost" type="button" onClick={toggle}>
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
