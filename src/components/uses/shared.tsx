"use client";

import type { ReactNode } from "react";
import { Bar } from "@/components/answer-card";
import { Button } from "@/components/ui/button";
import { api, describeError, MODEL, type Answer, type JSONContent, type Question, type SystemOneResponse } from "@/lib/kev";

export const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** One Kev request: one state, the given questions. */
export function ask(state: JSONContent, questions: Record<string, Question>): Promise<SystemOneResponse> {
  return api.systemOne({ state, model: MODEL, questions });
}

/** Runs fn over items with at most `limit` requests in flight, in input order of start. Stops early when isCancelled() turns true. */
export async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>, isCancelled: () => boolean) {
  let next = 0;
  async function worker() {
    while (next < items.length && !isCancelled()) {
      const i = next++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function probsOf(a: Answer): Record<string, number> {
  return a.type === "noul" ? { yes: a.noul, no: 1 - a.noul } : a.probabilities;
}

/** Bars for one answer, highest first (score levels keep their order). */
export function AnswerBars({ answer, labels }: { answer: Answer; labels?: Record<string, string> }) {
  const probs = probsOf(answer);
  const top = answer.type === "noul" ? (answer.noul >= 0.5 ? "yes" : "no") : answer.type === "choice" ? answer.choice : String(Math.round(answer.score));
  const entries = answer.type === "score" ? Object.entries(probs) : Object.entries(probs).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col">
      {entries.map(([k, p]) => <Bar key={k} label={labels?.[k] ?? k} mono={answer.type === "choice"} p={p} top={k === top} />)}
    </div>
  );
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-medium">{label}{hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}</label>
      {children}
    </div>
  );
}

export const textareaCls = "w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-[13px] leading-5 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
export const inputCls = "h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function Presets<T extends { name: string }>({ presets, current, onPick }: { presets: T[]; current: number; onPick: (i: number) => void }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]" role="group" aria-label="Examples">
      <span className="text-muted-foreground">Examples:</span>
      {presets.map((p, i) => (
        <button key={p.name} type="button" onClick={() => onPick(i)} aria-pressed={i === current}
          className={`rounded-full border px-3 py-1 transition-colors ${i === current ? "border-(--demo) bg-(--demo-soft) text-foreground" : "border-border text-muted-foreground hover:border-(--demo-line) hover:text-foreground"}`}>
          {p.name}
        </button>
      ))}
    </div>
  );
}

export const accentButton = "h-9 rounded-lg bg-(--demo) px-4 text-white shadow-sm transition-transform hover:-translate-y-px hover:bg-(--demo) hover:opacity-90 active:translate-y-0";

export function RunBar({ onRun, busy, label = "Run", busyLabel = "Running", disabled, children }: {
  onRun: () => void; busy: boolean; label?: string; busyLabel?: string; disabled?: boolean; children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={onRun} disabled={busy || disabled} className={accentButton}>{busy ? busyLabel : label}</Button>
      {children}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[13px] leading-5 text-destructive">{describeError(error)}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-(--demo-line) bg-(--demo-soft) p-8 text-center text-[13px] text-muted-foreground">{children}</p>;
}

/** The big outcome line: a verdict plus a short reason. */
export function Verdict({ label, tone, children }: { label: string; tone: "go" | "stop" | "wait" | "plain"; children?: ReactNode }) {
  const toneCls = {
    go: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    stop: "border-destructive/40 bg-destructive/10 text-destructive",
    wait: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    plain: "border-border bg-muted/40 text-foreground",
  }[tone];
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={`rounded-md border px-2.5 py-1 font-mono text-sm font-semibold tracking-wide ${toneCls}`}>{label}</span>
      {children && <span className="text-[13px] leading-5 text-muted-foreground">{children}</span>}
    </div>
  );
}

export function Latency({ r }: { r: SystemOneResponse }) {
  return <span className="text-[12px] tabular-nums text-muted-foreground">{r.latency_ms.toFixed(0)} ms · {r.usage.input_tokens} input tokens</span>;
}

/** Two-column demo body: inputs left, result right. */
export function DemoGrid({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">{left}</div>
      <div className="flex min-w-0 flex-col gap-4">{right}</div>
    </div>
  );
}

export function ResultCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
      <h4 className="mb-2 text-[12px] text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}
