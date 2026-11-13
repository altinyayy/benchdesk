"use client";

import { useSyncExternalStore } from "react";

const KEY = "benchdesk-theme";
const EVENT = "benchdesk-theme-change";

// The inline script in layout.tsx sets data-theme from localStorage before
// first paint; this component only reads and updates that attribute.
// Light by default; dark only when the visitor has chosen it.
function isDark() {
  return document.documentElement.dataset.theme === "dark";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
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
