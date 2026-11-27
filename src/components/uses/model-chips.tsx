"use client";

import { useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/d1a";
import { useText } from "@/lib/i18n";
import type { Chip, Status } from "@/lib/models-status";

// Which model answers each tier of the routing demo, and whether it is ready (GET /api/models-status, read from D1A's
// card). Polled every 10 s while the tab is visible; reading it never sends a chat and never keeps a model awake.
const POLL_MS = 10_000;

const EN = {
  label: "Models",
  ready: "ready", unknown: "state unknown", offline: "offline",
  busy: (n: number, m: number) => `busy (${n} running, ${m} waiting)`,
  nightly: (at: string) => `offline (nightly training, back ~${at})`,
};
const TEXT = {
  en: EN,
  ja: {
    label: "モデル",
    ready: "利用可能", unknown: "状態不明", offline: "停止中",
    busy: (n: number, m: number) => `混雑（${n} 件処理中、${m} 件待ち）`,
    nightly: (at: string) => `停止中（夜間の学習、${at} ごろ再開）`,
  },
} satisfies Record<string, typeof EN>;

const DOT: Record<Chip["state"], string> = { ready: "bg-emerald-500", busy: "bg-amber-500", offline: "bg-destructive", unknown: "bg-muted-foreground/50" };

export function ModelChips() {
  const t = useText(TEXT);
  const [chips, setChips] = useState<Chip[] | null>(null);
  useEffect(() => {
    let alive = true;
    function tick() {
      if (document.visibilityState !== "visible") return;   // no polling from a background tab
      fetch(`${BASE_PATH}/api/models-status`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() as Promise<Status> : null))
        .then((j) => { if (alive && j) setChips(j.chips); })
        .catch(() => { /* keep the last reading */ });
    }
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearTimeout(first); clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);
  if (!chips) return null;
  const say = (c: Chip) => c.nightly && c.backAt ? t.nightly(c.backAt) : c.state === "busy" ? t.busy(c.inFlight ?? 0, c.waiting ?? 0) : t[c.state];
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t.label}>
      <span className="text-[11px] text-muted-foreground">{t.label}:</span>
      {chips.map((c) => (
        <span key={c.tier} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] leading-4" title={say(c)}>
          <span className={`size-1.5 rounded-full ${DOT[c.state]}`} aria-hidden />
          <span className="font-mono">{c.tier}</span> · <span className="font-mono">{c.model}</span>
          {!c.d1a && <span className="text-muted-foreground">{say(c)}</span>}
        </span>
      ))}
    </div>
  );
}
