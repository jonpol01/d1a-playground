"use client";

import { useEffect, useSyncExternalStore } from "react";

// Two UI languages, Japanese by default. The choice is kept in localStorage; ?lang=en or ?lang=ja in the URL wins over it.
export type Lang = "ja" | "en";
export const LANGS: Lang[] = ["ja", "en"];
const DEFAULT: Lang = "ja";
const KEY = "d1a-lang";

const isLang = (v: unknown): v is Lang => v === "ja" || v === "en";
let current: Lang | null = null;
const listeners = new Set<() => void>();

function read(): Lang {
  if (current) return current;
  let lang = DEFAULT;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (isLang(saved)) lang = saved;
  } catch { /* storage blocked: keep the default */ }
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (isLang(fromUrl)) lang = fromUrl;
  current = lang;
  return lang;
}

export function setLang(lang: Lang) {
  current = lang;
  try { window.localStorage.setItem(KEY, lang); } catch { /* not remembered, still switched */ }
  const url = new URL(window.location.href);
  if (url.searchParams.has("lang")) {   // keep a shared ?lang= link from switching the page back on reload
    url.searchParams.set("lang", lang);
    window.history.replaceState(window.history.state, "", url);
  }
  listeners.forEach((f) => f());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** The current UI language. The server render (and the first client render) use the default. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}

/** Keeps <html lang> in step with the UI language; mount it once per page. */
export function useHtmlLang() {
  const lang = useLang();
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
}

/** Picks this language's entry from a pair of dictionaries with the same shape. */
export function useText<T>(dict: Record<Lang, T>): T {
  return dict[useLang()];
}
