"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ShieldAlert, ShieldCheck, Star, X } from "lucide-react";
import { useLang, useText } from "@/lib/i18n";

// Illustrative result visuals. Every one is driven by the probabilities the server returned; the numeric bars stay
// underneath each visual so the uncertainty is always visible.

/** Animates a number from its previous value to `value`. */
export function CountUp({ value, format = (v) => v.toFixed(2), ms = 700 }: { value: number; format?: (v: number) => string; ms?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      const v = a + (b - a) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular-nums">{format(shown)}</span>;
}

export function Shimmer({ lines = 4, tall = false }: { lines?: number; tall?: boolean }) {
  const label = useText({ en: "Waiting for the model", ja: "モデルの応答を待っています" });
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={label}>
      <div className={`shimmer rounded-xl ${tall ? "h-44" : "h-28"}`} />
      {Array.from({ length: lines }, (_, i) => <div key={i} className="shimmer h-3 rounded-full" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

const CONFETTI_COLORS = ["#7c3aed", "#db2777", "#f59e0b", "#10b981", "#0ea5e9", "#ef4444"];
/** A short confetti burst; re-mount it (change its key) to fire again. Deterministic, so render stays pure. */
export function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center" aria-hidden>
      <div className="relative h-0 w-0">
        {Array.from({ length: 22 }, (_, i) => {
          const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.3;
          const r = 90 + ((i * 37) % 70);
          return (
            <span key={i} className="confetti-bit" style={{
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              ["--dx" as string]: `${Math.cos(angle) * r}px`, ["--dy" as string]: `${Math.sin(angle) * r * 0.7 + 60}px`,
              ["--rot" as string]: `${(i * 67) % 360}deg`, animationDelay: `${(i % 5) * 25}ms`,
            }} />
          );
        })}
      </div>
    </div>
  );
}

/** Frame for a visual: soft accent background, rounded, with room for an overlay. */
export function VizFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative overflow-hidden rounded-2xl border border-(--demo-line) bg-(--demo-soft) p-5 ${className}`}>{children}</div>;
}

/* ---------------------------------------------------------------- 1. routing */

const TIER_Y: Record<string, number> = { small: 40, medium: 100, large: 160 };
export function RouteViz({ probs, chosen, costs }: { probs: Record<string, number>; chosen: string; costs: Record<string, number> }) {
  const t = useText({ en: { aria: `Routed to the ${chosen} model`, prompt: "prompt" }, ja: { aria: `${chosen} モデルに振り分け`, prompt: "プロンプト" } });
  return (
    <svg viewBox="0 0 560 200" className="h-auto w-full" role="img" aria-label={t.aria}>
      <path d="M 96 100 L 196 100" stroke="var(--demo)" strokeWidth="2" fill="none" className="flow-dash" opacity="0.7" />
      {Object.entries(TIER_Y).map(([tier, y]) => {
        const p = probs[tier] ?? 0, on = tier === chosen;
        const d = `M 266 100 C 330 100, 340 ${y}, 400 ${y}`;
        return (
          <path key={`${tier}-${chosen}`} d={d} fill="none" stroke={on ? "var(--demo)" : "currentColor"} strokeLinecap="round"
            strokeWidth={2 + 7 * p} opacity={on ? 1 : 0.12 + 0.5 * p} className={on ? "draw-path" : ""} style={{ ["--len" as string]: 200 }} />
        );
      })}
      <g>
        <rect x="8" y="78" width="88" height="44" rx="10" className="fill-card stroke-border" />
        <text x="52" y="105" textAnchor="middle" className="fill-muted-foreground text-[13px]">{t.prompt}</text>
      </g>
      <g>
        <rect x="196" y="70" width="70" height="60" rx="14" fill="var(--demo)" />
        <text x="231" y="106" textAnchor="middle" className="fill-white font-heading text-[16px] font-bold">D1A</text>
      </g>
      {Object.entries(TIER_Y).map(([tier, y]) => {
        const on = tier === chosen;
        return (
          <g key={tier} className="transition-opacity" opacity={on ? 1 : 0.55}>
            <rect x="400" y={y - 20} width="152" height="40" rx="10" fill={on ? "var(--demo)" : "var(--card)"} stroke={on ? "var(--demo)" : "var(--border)"} />
            <text x="414" y={y + 5} className={`text-[13px] font-medium ${on ? "fill-white" : "fill-foreground"}`}>{tier}</text>
            <text x="540" y={y + 5} textAnchor="end" className={`font-mono text-[12px] ${on ? "fill-white" : "fill-muted-foreground"}`}>${costs[tier].toFixed(2)}/1k</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- 2. guardrails */

const CATEGORY_COLOR: Record<string, string> = { safe: "#10b981", prompt_injection: "#ef4444", abuse: "#f97316", off_policy: "#8b5cf6" };
export function ShieldViz({ allow, probs, chosen }: { allow: boolean; probs: Record<string, number>; chosen: string }) {
  const color = allow ? "#10b981" : "#ef4444";
  const Icon = allow ? ShieldCheck : ShieldAlert;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div key={String(allow) + chosen} className="pop-in grid size-28 shrink-0 place-items-center rounded-3xl" style={{ background: `color-mix(in oklch, ${color} 16%, transparent)`, boxShadow: `0 0 40px -8px ${color}` }}>
        <Icon className="size-16" style={{ color }} strokeWidth={1.6} aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        {Object.entries(probs).sort((a, b) => b[1] - a[1]).map(([k, p]) => (
          <span key={k} className="rounded-full border px-3 py-1 font-mono text-[12px] transition-all duration-500"
            style={{ borderColor: CATEGORY_COLOR[k] ?? "var(--border)", color: CATEGORY_COLOR[k], background: `color-mix(in oklch, ${CATEGORY_COLOR[k] ?? "#888"} ${Math.round(4 + p * 22)}%, transparent)`, boxShadow: `0 0 ${Math.round(p * 26)}px -2px ${CATEGORY_COLOR[k] ?? "#888"}`, opacity: 0.45 + 0.55 * p, fontWeight: k === chosen ? 600 : 400 }}>
            {k} {p.toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 3. tool-call gating */

const LAMPS = [
  { id: "allow", color: "#10b981", label: { en: "run it", ja: "実行する" } },
  { id: "ask", color: "#f59e0b", label: { en: "ask the user", ja: "ユーザーに確認" } },
  { id: "deny", color: "#ef4444", label: { en: "refuse", ja: "拒否する" } },
];
export function TrafficLight({ probs, chosen }: { probs: Record<string, number>; chosen: string }) {
  const lang = useLang();
  return (
    <div className="flex items-center gap-6">
      <div className="flex flex-col gap-3 rounded-[1.75rem] bg-neutral-900 p-3 shadow-lg dark:bg-black" aria-hidden>
        {LAMPS.map((l) => {
          const p = probs[l.id] ?? 0, on = l.id === chosen;
          return <span key={l.id} className="block size-12 rounded-full transition-all duration-500" style={{ background: l.color, opacity: on ? 1 : 0.12 + 0.45 * p, boxShadow: on ? `0 0 28px 4px ${l.color}` : "none" }} />;
        })}
      </div>
      <ul className="flex flex-col gap-5">
        {LAMPS.map((l) => (
          <li key={l.id} className={`flex items-baseline gap-2 text-[14px] ${l.id === chosen ? "font-semibold" : "text-muted-foreground"}`} style={l.id === chosen ? { color: l.color } : undefined}>
            <span className="font-mono">{l.id}</span><span className="text-[12px]">{l.label[lang]}</span>
            <span className="font-mono text-[12px] tabular-nums">{(probs[l.id] ?? 0).toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- 6. evals */

const LEVEL_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#10b981"];
export function StarsViz({ score, probs }: { score: number; probs: Record<string, number> }) {
  // score is 1..5 here
  const aria = useText({ en: `${score.toFixed(1)} out of 5`, ja: `5 点中 ${score.toFixed(1)} 点` });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="relative" aria-label={aria} role="img">
          <div className="flex gap-1 text-muted-foreground/30">{Array.from({ length: 5 }, (_, i) => <Star key={i} className="size-9" fill="currentColor" strokeWidth={0} />)}</div>
          <div className="absolute inset-0 overflow-hidden transition-[width] duration-700 ease-out" style={{ width: `${(score / 5) * 100}%` }}>
            <div className="flex w-max gap-1 text-amber-400">{Array.from({ length: 5 }, (_, i) => <Star key={i} className="size-9" fill="currentColor" strokeWidth={0} />)}</div>
          </div>
        </div>
        <p className="font-heading text-4xl font-semibold tracking-tight"><CountUp value={score} format={(v) => v.toFixed(1)} /><span className="text-lg text-muted-foreground"> / 5</span></p>
      </div>
      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          {Object.entries(probs).map(([k, p], i) => <span key={k} className="h-full transition-all duration-700" style={{ width: `${p * 100}%`, background: LEVEL_COLORS[i] }} />)}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">{LEVEL_COLORS.map((c, i) => <span key={c} style={{ color: c }}>{i + 1}★</span>)}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 7. bulk labeling */

export function ProgressRing({ done, total, size = 64 }: { done: number; total: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, k = total ? done / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="6" className="stroke-muted" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="6" stroke="var(--demo)" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - k)} className="transition-[stroke-dashoffset] duration-300" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="rotate-90 fill-foreground text-[13px] font-semibold" style={{ transformOrigin: "center" }}>{Math.round(k * 100)}%</text>
    </svg>
  );
}

/* ---------------------------------------------------------------- 9. confidence gate */

export function GateTrack({ p, act, human }: { p: number; act: number; human: number }) {
  const lane = p > act ? "act" : p >= human ? "confirm" : "human";
  const color = lane === "act" ? "#10b981" : lane === "confirm" ? "#f59e0b" : "#ef4444";
  const t = useText({ en: { human: "human", confirm: "confirm", act: "act" }, ja: { human: "人へ", confirm: "確認", act: "実行" } });
  return (
    <div className="pt-8 pb-2">
      <div className="relative h-10 w-full">
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <span className="h-full transition-all duration-300" style={{ width: `${human * 100}%`, background: "color-mix(in oklch, #ef4444 30%, transparent)" }} />
          <span className="h-full transition-all duration-300" style={{ width: `${(act - human) * 100}%`, background: "color-mix(in oklch, #f59e0b 32%, transparent)" }} />
          <span className="h-full flex-1 transition-all duration-300" style={{ background: "color-mix(in oklch, #10b981 32%, transparent)" }} />
        </div>
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out" style={{ left: `${p * 100}%` }}>
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap text-white" style={{ background: color }}>p {p.toFixed(2)}</span>
          <span className="block size-7 rounded-full border-4 border-background shadow-lg" style={{ background: color, boxShadow: `0 0 18px ${color}` }} />
        </div>
      </div>
      <div className="relative mt-2 h-4 text-[11px] text-muted-foreground">
        <span className="absolute -translate-x-1/2" style={{ left: `${(human / 2) * 100}%` }}>{t.human}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${((human + act) / 2) * 100}%` }}>{t.confirm}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${((act + 1) / 2) * 100}%` }}>{t.act}</span>
      </div>
    </div>
  );
}

export function YesNo({ yes, label }: { yes: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${yes ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/15 text-rose-700 dark:text-rose-400"}`}>
      {yes ? <Check className="size-3.5" /> : <X className="size-3.5" />}{label}
    </span>
  );
}
