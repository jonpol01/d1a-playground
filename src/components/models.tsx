"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LangSwitch, LicensesLink } from "@/components/use-cases";
import { useHtmlLang, useText, type Lang } from "@/lib/i18n";

// The D1A model family on one page: which Gemma 4 trunk each model sits on, how the sizes differ, how one model answers
// both decisions and chat, how they score and which builds exist. Numbers are from the model cards on the Hugging Face
// Hub (JohnP1/d1a-*) and jonpol01/d1a's docs/MODELS.md; the 12B plan is jonpol01/d1a#270.

const link = "font-medium text-foreground underline underline-offset-2";
const C = { e2b: "#0284c7", e4b: "#7c3aed", b12: "#d97706", it: "#059669", head: "#c026d3", chat: "#e11d48", muted: "#94a3b8" };

/* ------------------------------------------------------------------ diagrams (inline SVG, both themes) */

function Box({ x, y, w, h, title, sub, color, dashed = false }: { x: number; y: number; w: number; h: number; title: string; sub?: string; color: string; dashed?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={`color-mix(in oklch, ${color} 12%, var(--card))`} stroke={color} strokeDasharray={dashed ? "5 4" : undefined} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 4)} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" className="fill-muted-foreground text-[10px]">{sub}</text>}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, dashed = false }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
  return <path d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray={dashed ? "4 4" : undefined} markerEnd="url(#marr)" />;
}

function Defs() {
  return <defs><marker id="marr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--muted-foreground)" /></marker></defs>;
}

type Kid = { trunk: string; trunkSub: string; model: string; sub: string; newest?: boolean; planned?: boolean };

function FamilyDiagram({ t }: { t: Text }) {
  // three trunk sizes; under each, its trunks (the base, the instruction-tuned -it, Google's 4-bit QAT -it) and the D1A
  // model trained on each
  const groups: { name: string; color: string; kids: Kid[] }[] = [
    { name: "E2B", color: C.e2b, kids: [{ trunk: t.base, trunkSub: t.baseSub, model: "D1A-E2B v0.6.1", sub: t.decisions }, { trunk: t.it, trunkSub: t.itSub, model: "D1A-E2B-it v0.6", sub: t.decisionsChat }, { trunk: t.itQat, trunkSub: t.itQatSub, model: "D1A-E2B-it QAT", sub: t.decisionsChat }] },
    { name: "E4B", color: C.e4b, kids: [{ trunk: t.base, trunkSub: t.baseSub, model: "D1A-E4B v0.6.1", sub: t.decisions }, { trunk: t.it, trunkSub: t.itSub, model: "D1A-E4B-it v0.6", sub: t.decisionsChat }, { trunk: t.itQat, trunkSub: t.itQatSub, model: "D1A-E4B-it QAT", sub: t.decisionsChat, newest: true }] },
    { name: "12B", color: C.b12, kids: [{ trunk: t.itQat, trunkSub: t.itQatSub, model: "D1A-12B", sub: t.planned, planned: true }] },
  ];
  let right = 16;
  const cols = groups.map((g) => { const w = g.kids.length === 1 ? 264 : 32 + g.kids.length * 120 - 8, c = { ...g, x: right, w }; right += w + 16; return c; });
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${right} 290`} className="h-auto w-full min-w-[900px]" role="img" aria-label={t.familyAria}>
        <Defs />
        {cols.map((c) => (
          <g key={c.name}>
            <rect x={c.x} y={8} width={c.w} height={274} rx={18} fill={`color-mix(in oklch, ${c.color} 5%, transparent)`} stroke={`color-mix(in oklch, ${c.color} 40%, var(--border))`} />
            <text x={c.x + 16} y={34} className="font-heading fill-foreground text-[15px] font-semibold">Gemma 4 {c.name}</text>
            <text x={c.x + 16} y={52} className="fill-muted-foreground text-[10px]">{c.name === "12B" ? t.trunk12 : c.name === "E4B" ? t.trunkE4 : t.trunkE2}</text>
            {c.kids.map((k, i) => {
              const w = c.kids.length === 1 ? 232 : 112, x = c.kids.length === 1 ? c.x + 16 : c.x + 16 + i * 120;
              return (
                <g key={k.model}>
                  <Box x={x} y={70} w={w} h={44} title={k.trunk} sub={k.trunkSub} color={k.trunk === t.base ? C.muted : C.it} dashed={k.planned} />
                  <Arrow x1={x + w / 2} y1={114} x2={x + w / 2} y2={146} dashed={k.planned} />
                  <Box x={x} y={150} w={w} h={56} title={k.model} sub={k.sub} color={c.color} dashed={k.planned} />
                  {k.newest && <text x={x + w / 2} y={224} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">{t.newest}</text>}
                </g>
              );
            })}
            <text x={c.kids.length === 1 ? c.x + 138 : c.x + 132} y={134} textAnchor={c.kids.length === 1 ? "start" : "middle"} className="fill-muted-foreground text-[9px]">{t.loraHead}</text>
            <text x={c.x + 16} y={262} className="fill-muted-foreground text-[10px]">{c.name === "12B" ? t.foot12 : c.name === "E4B" ? t.footE4 : t.footE2}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function SizeDiagram({ t }: { t: Text }) {
  // one strip per trunk, one bar per layer: tall = full (global) attention, short = sliding window; faded = layers that
  // reuse an earlier layer's keys and values (E-series KV sharing)
  const rows = [
    { name: "E2B", layers: 35, every: 5, shared: 20, hidden: 1536, color: C.e2b, note: t.noteE2 },
    { name: "E4B", layers: 42, every: 6, shared: 18, hidden: 2560, color: C.e4b, note: t.noteE4 },
    { name: "12B", layers: 48, every: 6, shared: 0, hidden: 3840, color: C.b12, note: t.note12 },
  ];
  const slot = 11, x0 = 96;
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 856 236" className="h-auto w-full min-w-[700px]" role="img" aria-label={t.sizeAria}>
        {rows.map((r, ri) => {
          const y = 22 + ri * 70;
          return (
            <g key={r.name}>
              <text x={8} y={y + 22} className="font-heading fill-foreground text-[14px] font-semibold">{r.name}</text>
              <text x={8} y={y + 38} className="fill-muted-foreground text-[10px]">{r.layers} {t.layersWord}</text>
              {Array.from({ length: r.layers }, (_, i) => {
                const full = i % r.every === r.every - 1, shared = i >= r.layers - r.shared;
                return <rect key={i} x={x0 + i * slot} y={full ? y : y + 16} width={slot - 3} height={full ? 40 : 24} rx={1.5}
                  fill={full ? r.color : "var(--muted-foreground)"} opacity={(full ? 0.95 : 0.4) * (shared ? 0.45 : 1)} />;
              })}
              <rect x={x0 + 48 * slot + 18} y={y + 12} width={(r.hidden / 3840) * 130} height={16} rx={4} fill={`color-mix(in oklch, ${r.color} 55%, var(--card))`} />
              <text x={x0 + 48 * slot + 18} y={y + 44} className="fill-muted-foreground text-[10px]">{t.hiddenWord} {r.hidden.toLocaleString("en-US")}</text>
              <text x={x0} y={y + 58} className="fill-muted-foreground text-[9.5px]">{r.note}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-muted-foreground">{t.sizeLegend}</p>
    </div>
  );
}

function TwoJobsDiagram({ t }: { t: Text }) {
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 856 250" className="h-auto w-full min-w-[700px]" role="img" aria-label={t.jobsAria}>
        <Defs />
        <rect x={16} y={56} width={230} height={110} rx={16} className="fill-card stroke-border" />
        <text x={131} y={84} textAnchor="middle" className="font-heading fill-foreground text-[14px] font-semibold">Gemma 4 E4B-it</text>
        <text x={131} y={102} textAnchor="middle" className="fill-muted-foreground text-[10px]">{t.frozen}</text>
        <rect x={40} y={116} width={182} height={34} rx={9} fill={`color-mix(in oklch, ${C.it} 14%, var(--card))`} stroke={C.it} />
        <text x={131} y={137} textAnchor="middle" className="fill-foreground text-[10.5px]">{t.switchLabel}</text>

        <path d="M 246 96 C 300 96, 290 52, 330 52" fill="none" stroke={C.head} strokeWidth={2} markerEnd="url(#marr)" />
        <text x={252} y={44} className="fill-foreground text-[10px] font-semibold">{t.on}</text>
        <Box x={334} y={24} w={170} h={56} title={t.head} sub={t.headSub} color={C.head} />
        <Arrow x1={504} y1={52} x2={548} y2={52} />
        <Box x={552} y={24} w={290} h={56} title={t.decisionOut} sub="POST /v1/systemone" color={C.head} />

        <path d="M 246 130 C 290 130, 290 176, 330 176" fill="none" stroke={C.chat} strokeWidth={2} markerEnd="url(#marr)" />
        <text x={252} y={204} className="fill-foreground text-[10px] font-semibold">{t.off}</text>
        <Box x={334} y={148} w={170} h={56} title={t.lmHead} sub={t.lmHeadSub} color={C.chat} />
        <Arrow x1={504} y1={176} x2={548} y2={176} />
        <Box x={552} y={148} w={290} h={56} title={t.chatOut} sub="POST /v1/chat/completions" color={C.chat} />
        <text x={16} y={236} className="fill-muted-foreground text-[10px]">{t.jobsFoot}</text>
      </svg>
    </div>
  );
}

function InterleaveDiagram({ t }: { t: Text }) {
  // a chat's prefill chunks and tokens on the model thread, with decisions cutting in between them (d1a #289, #290)
  const seq: ("p" | "t" | "d")[] = ["p", "p", "d", "p", "t", "t", "d", "t", "t", "d", "t", "t"];
  let x = 16;
  const w = { p: 70, t: 52, d: 58 };
  const placed = seq.map((k) => { const p = { k, x }; x += w[k] + 4; return p; });
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${x + 16} 92`} className="h-auto w-full min-w-[640px]" role="img" aria-label={t.interleaveAria}>
        {placed.map((p, i) => (
          <g key={i}>
            <rect x={p.x} y={30} width={w[p.k]} height={28} rx={6}
              fill={`color-mix(in oklch, ${p.k === "d" ? C.head : C.chat} ${p.k === "p" ? 8 : 16}%, var(--card))`} stroke={p.k === "d" ? C.head : C.chat} strokeDasharray={p.k === "p" ? "4 3" : undefined} />
            <text x={p.x + w[p.k] / 2} y={48} textAnchor="middle" className="fill-foreground text-[10px]">{p.k === "p" ? t.prefill : p.k === "t" ? t.tok : t.decision}</text>
          </g>
        ))}
        <text x={16} y={20} className="fill-muted-foreground text-[10px]">{t.timeline}</text>
        <text x={16} y={80} className="fill-muted-foreground text-[10px]">{t.interleaveFoot}</text>
      </svg>
    </div>
  );
}

const SCORES: [string, number, number][] = [
  ["decision-v7", 84.8, 85.7], ["transfer-v4", 75.0, 77.4], ["hard-v1", 69.2, 75.7], ["devtools-v1", 71.1, 74.3],
  ["documents-v1", 86.3, 88.6], ["JGLUE test", 76.4, 78.6], ["PR labels test", 77.4, 79.1], ["routing (factory)", 92.3, 93.6],
  ["TypeSafe", 69.6, 86.3], ["wanli-v2", 68.9, 72.7], ["dates", 87.0, 90.8], ["unknowable", 69.5, 66.7],
];

function ScoresChart({ t }: { t: Text }) {
  const lo = 60, hi = 100, x0 = 140, wBar = 560, rowH = 26;
  const sx = (v: number) => x0 + ((v - lo) / (hi - lo)) * wBar;
  const h = 40 + SCORES.length * rowH;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 856 ${h}`} className="h-auto w-full min-w-[640px]" role="img" aria-label={t.scoresAria}>
        {[60, 70, 80, 90, 100].map((v) => (
          <g key={v}>
            <line x1={sx(v)} y1={18} x2={sx(v)} y2={h - 8} stroke="var(--border)" />
            <text x={sx(v)} y={12} textAnchor="middle" className="font-mono fill-muted-foreground text-[9px]">{v}%</text>
          </g>
        ))}
        {SCORES.map(([name, a, b], i) => {
          const y = 26 + i * rowH, d = b - a;
          return (
            <g key={name}>
              <text x={x0 - 8} y={y + 13} textAnchor="end" className="fill-foreground text-[11px]">{name}</text>
              <rect x={x0} y={y + 2} width={sx(a) - x0} height={8} rx={3} fill={C.e2b} opacity={0.75} />
              <rect x={x0} y={y + 11} width={sx(b) - x0} height={8} rx={3} fill={C.e4b} />
              <text x={Math.max(sx(a), sx(b)) + 8} y={y + 15} className={`font-mono text-[10px] ${d < 0 ? "fill-[#e11d48]" : "fill-foreground"}`}>{d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(1)}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm align-middle" style={{ background: C.e2b, opacity: 0.75 }} />D1A-E2B-it v0.6</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm align-middle" style={{ background: C.e4b }} />D1A-E4B-it v0.6</span>
        <span>{t.scoresLegend}</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ text */

const EN = {
  back: "Playground", title: "The D1A models", kicker: "Models",
  intro: "Every D1A model is the same design on a different Gemma 4 trunk: a LoRA adapter and a small pointer head that read typed questions about a document and return a calibrated probability for every option, in one forward pass. Two things vary: the trunk's size (E2B, E4B, and a planned 12B) and its kind (the pretrained base, the instruction-tuned -it model, or Google's 4-bit quantization-aware-trained -it). On an -it trunk the same model also chats: switch the adapter off and it is the -it model exactly.",
  credit: <>Weights and model cards: <a className={link} href="https://huggingface.co/JohnP1">huggingface.co/JohnP1</a>. The list of builds is kept in <a className={link} href="https://github.com/jonpol01/d1a/blob/main/docs/MODELS.md">docs/MODELS.md</a>; how the model itself works is on the <Link className={link} href="/architecture">architecture</Link> page.</>,
  s1: "1. The family",
  s1body: "Seven models on seven trunks. The base-trunk models (E2B, E4B v0.6.1) answer decisions only. The -it models were trained with the same recipe and data mix (23,427 records, byte for byte) and keep the -it model's own chat, vision and audio. The QAT models are those -it adapters retrained on Google's 4-bit quantization-aware-trained -it trunks, whose 4-bit weights they keep exactly: D1A-E2B-it QAT is the recommended E2B-it build, and D1A-E4B-it QAT, the newest, is level with D1A-E4B-it v0.6 overall. D1A-12B is planned, not trained.",
  base: "base", baseSub: "pretrained", it: "-it", itSub: "instruction-tuned", itQat: "-it, QAT", itQatSub: "4-bit", head: "pointer head",
  loraHead: "+ LoRA + head", decisions: "decisions", decisionsChat: "decisions + chat", planned: "planned (not trained)", newest: "newest · 2026-10-27",
  trunkE2: "about 2B effective parameters · on-device size", trunkE4: "about 4B effective parameters", trunk12: "dense 12B, quantization-aware trained for 4-bit",
  footE2: "fastest: about 1/3 of E4B's time per decision", footE4: "the most accurate published D1A", foot12: "more accuracy expected · 7.4 GB at 4-bit",
  familyAria: "The D1A family: Gemma 4 trunks and the D1A model on each",
  s2: "2. Size and shape",
  s2body: "The E-series trunks (E2B, E4B) are built for phones and small machines: per-layer embeddings carry part of the parameters outside the main stack, most layers attend only to a 512-token window, and the last layers reuse earlier layers' keys and values. The 12B is a plain dense model: more layers, a wider hidden state, a 1,024-token window, and no per-layer embeddings or shared keys and values.",
  layersWord: "layers", hiddenWord: "hidden",
  noteE2: "full attention every 5th layer · last 20 layers share keys and values · LoRA 24.9M trainable",
  noteE4: "full attention every 6th layer · last 18 layers share keys and values · LoRA 34.9M trainable",
  note12: "full attention every 6th layer · sliding window 1,024 · no shared keys and values, no per-layer embeddings",
  sizeLegend: "Tall bars: full (global) attention. Short bars: sliding-window attention. Faded: layers that reuse earlier keys and values. The bar on the right is the hidden size.",
  sizeAria: "Layer strips of E2B, E4B and 12B",
  s3: "3. One model, two jobs",
  s3body: "On an -it trunk the adapter is kept separate from the weights (an unmerged build). With it on, the pointer head reads the hidden states and returns probabilities. With it off, the model is the -it model, bit for bit, and its own language-model head writes text. So one copy in memory serves System One decisions and OpenAI-format chat, and apps such as n8n or mem0 use the same model that decides.",
  frozen: "frozen weights, loaded once", switchLabel: "LoRA adapter: on / off", on: "adapter on", off: "adapter off",
  headSub: "q·k over options, ÷ T", lmHead: "language-model head", lmHeadSub: "the -it model's own",
  decisionOut: "calibrated probabilities", chatOut: "chat text, tools, JSON",
  jobsFoot: "The published v0.6 -mlx-q8 / -mlx-q4 repositories have the adapter merged into the weights: they answer decisions only. The QAT builds keep it separate and chat as published.",
  jobsAria: "One model: adapter on for decisions, off for chat",
  s3b: "Decisions do not wait for a chat",
  s3bbody: "Both jobs share one model thread. A decision that arrives while a chat is generating is answered between two of the chat's tokens, or between two chunks of a long prompt, with the adapter switched on for it and off again after. The chat's text and the decision's probabilities are the same as when each runs alone. On D1A-E4B-it a decision during a 200-token chat waits 0.24 s instead of 4-5 s.",
  prefill: "prompt chunk", tok: "token", decision: "decision", timeline: "the model thread over time",
  interleaveFoot: "dashed: the chat's prompt being read (prefill) · solid: generated tokens · magenta: a decision cutting in",
  interleaveAria: "Decisions cutting in between a chat's prompt chunks and tokens",
  s4: "4. How they score",
  s4body: "D1A-E4B-it against D1A-E2B-it on every D1A suite, both MLX 8-bit with the adapter unmerged, each at its own calibrated temperature (2026-10-17). E4B-it is ahead on 21 of 22 suites (pooled +2.5 points [+1.7, +3.4]) and behind on one, the unknowable-facts monitor. The price is time: about 2.9× E2B-it's model time per decision.",
  s4qat: <>D1A-E4B-it QAT against D1A-E4B-it v0.6 on every suite (MLX 4-bit against 8-bit, 2026-10-28): level overall (pooled −0.2 points [−0.9, +0.5]), ahead on PR labels (+1.6), PR severity (+6.0) and routing (+1.7, +1.5), behind on the external TypeSafe suite (−7.8, which comes from the 4-bit trunk). Every suite: <a className={link} href="https://github.com/jonpol01/d1a/blob/main/docs/reports/2026-10-28-e4b-it-qat-scorecard.md">the scorecard</a>.</>,
  scoresLegend: "accuracy %, the axis starts at 60",
  scoresAria: "Accuracy per suite, E2B-it against E4B-it",
  s4table: [
    ["calibration temperature", "1.41", "1.55", "1.66"],
    ["routing temperature", "not shipped", "not shipped", "not shipped"],
    ["model time per decision", "1×", "about 2.9×", "about 2.9×"],
    ["photos, voice, video (zero-shot)", "yes", "yes; catches damage E2B-it misses", "yes; 26 of 28 demo answers as v0.6's"],
  ] as [string, string, string, string][],
  s5: "5. Builds",
  s5body: "Each model ships in several formats. PyTorch is the adapter and head on the Hub trunk (any GPU or CPU; a QAT build rebuilds its 4-bit trunk on load); MLX runs on a Mac's GPU, with the photo, voice and video encoders; Core ML runs on the Apple Neural Engine or GPU: the v0.6 builds are text only, up to 512 tokens, while D1A-E2B-it QAT's also chats and reads photos, voice and video, through a Python reference runner on the GPU.",
  colModel: "model", colPt: "PyTorch", colMlx8: "MLX 8-bit", colMlx4: "MLX 4-bit", colCm8: "Core ML int8", colCm4: "Core ML int4",
  builds: [
    ["D1A-E4B-it QAT", "adapter", "—", "4.4 + 0.9 GB", "—", "not yet"],
    ["D1A-E4B-it v0.6", "adapter", "6.1 + 0.9 GB", "3.9 + 0.9 GB", "skipped", "4.4 GB"],
    ["D1A-E4B v0.6.1", "adapter", "6 + 1 GB", "—", "preview", "—"],
    ["D1A-E2B-it QAT", "adapter", "—", "2.9 + 0.9 GB", "—", "4.6 GB"],
    ["D1A-E2B-it v0.6", "adapter", "3.5 + 0.9 GB", "2.5 + 0.9 GB", "3.5 GB", "2.6 GB"],
    ["D1A-E2B v0.6.1", "adapter", "3.5 + 0.9 GB", "—", "yes", "—"],
    ["D1A-12B", "—", "planned", "planned", "—", "—"],
  ] as string[][],
  buildsNote: "MLX sizes: model + photo/voice/video encoders. The v0.6 -it chat builds are made locally from the adapter (scripts/export_mlx.py --unmerged); the QAT builds are published unmerged, at Google's own 4-bit grid (no 8-bit or int8 build).",
  s6: "6. The 12B plan",
  s6body: "D1A-12B would put D1A on Gemma 4 12B-it, trained for 4-bit (QAT), as one model for decisions, chat, vision and audio. The code is ready (the 12B port and the 4-bit converter are merged) and both training smoke runs passed; it is shelved until the training budget is approved.",
  plan: [
    ["Trunk", "google/gemma-4-12B-it QAT · 48 layers · hidden 3,840 · 7.4 GB as 4-bit"],
    ["Training", "about 10.8 h on one 48 GB GPU (L40S), about $19.5; peak 32.7 GB"],
    ["Ships only if", "transfer-v4 +3 points over E4B, PR severity at least E4B's, 4-bit flips ≤ 1/42, chat unchanged with the adapter off"],
    ["Status", "shelved 2026-10-14 · jonpol01/d1a#270"],
  ] as [string, string][],
};
type Text = typeof EN;

const JA: Text = {
  back: "プレイグラウンド", title: "D1A のモデル", kicker: "モデル",
  intro: "D1A のモデルはどれも同じ設計で、土台にする Gemma 4 のトランクだけが違います。LoRA アダプターと小さなポインターヘッドが、文書についての型付きの質問を読み、1回の順伝播ですべての選択肢に較正済みの確率を返します。違うのは2点です。トランクの大きさ（E2B、E4B、計画中の 12B）と種類（事前学習のベース、指示調整済みの -it、または Google が 4 ビット向けに量子化を考慮して学習した -it）。-it のトランクでは同じモデルがチャットもします。アダプターを外すと、そのまま -it モデルになるからです。",
  credit: <>重みとモデルカード: <a className={link} href="https://huggingface.co/JohnP1">huggingface.co/JohnP1</a>。ビルドの一覧は <a className={link} href="https://github.com/jonpol01/d1a/blob/main/docs/MODELS.md">docs/MODELS.md</a> にあります。モデル自体の仕組みは<Link className={link} href="/architecture">アーキテクチャ</Link>のページをご覧ください。</>,
  s1: "1. ファミリー",
  s1body: "7つのトランクに7つのモデル。ベースのトランクのモデル（E2B、E4B v0.6.1）は判断だけを返します。-it のモデルは同じレシピと同じデータ（23,427 件、バイト単位で同一）で学習し、-it モデル本来のチャット・画像・音声の能力を保っています。QAT のモデルは、その -it のアダプターを、Google が 4 ビット向けに量子化を考慮して学習した（QAT）-it トランクで学習し直したもので、その 4 ビットの重みをそのまま使います。E2B-it の推奨ビルドは D1A-E2B-it QAT、最新の D1A-E4B-it QAT は全体で D1A-E4B-it v0.6 と同等です。D1A-12B は計画中で、まだ学習していません。",
  base: "ベース", baseSub: "事前学習", it: "-it", itSub: "指示調整", itQat: "-it、QAT", itQatSub: "4 ビット", head: "ポインターヘッド",
  loraHead: "+ LoRA + ヘッド", decisions: "判断", decisionsChat: "判断 + チャット", planned: "計画中（未学習）", newest: "最新 · 2026-10-27",
  trunkE2: "実効パラメータ約 2B · 端末向けの大きさ", trunkE4: "実効パラメータ約 4B", trunk12: "密な 12B、4 ビット向けに量子化を考慮して学習",
  footE2: "最速: 1回の判断にかかる時間は E4B の約 1/3", footE4: "公開済みの D1A で最も高精度", foot12: "精度の上乗せを期待 · 4 ビットで 7.4 GB",
  familyAria: "D1A ファミリー: Gemma 4 のトランクとそれぞれの D1A モデル",
  s2: "2. 大きさと形",
  s2body: "E シリーズのトランク（E2B、E4B）はスマートフォンや小型のマシン向けです。層ごとの埋め込みがパラメータの一部を本体の外に持ち、ほとんどの層は 512 トークンの窓の中だけを見て、最後の層は前の層のキーとバリューを再利用します。12B は普通の密なモデルで、層が多く、隠れ状態が広く、窓は 1,024 トークン、層ごとの埋め込みもキー・バリューの共有もありません。",
  layersWord: "層", hiddenWord: "隠れ次元",
  noteE2: "5層ごとに全体アテンション · 最後の 20 層はキー・バリューを共有 · LoRA の学習パラメータ 24.9M",
  noteE4: "6層ごとに全体アテンション · 最後の 18 層はキー・バリューを共有 · LoRA の学習パラメータ 34.9M",
  note12: "6層ごとに全体アテンション · スライディング窓 1,024 · キー・バリュー共有なし、層ごとの埋め込みなし",
  sizeLegend: "高い棒: 全体（グローバル）アテンション。低い棒: スライディング窓のアテンション。薄い棒: 前の層のキー・バリューを再利用する層。右の棒は隠れ次元の大きさ。",
  sizeAria: "E2B、E4B、12B の層の並び",
  s3: "3. 1つのモデルで2つの仕事",
  s3body: "-it のトランクでは、アダプターを重みに合成せずに別に持ちます（unmerged ビルド）。オンにするとポインターヘッドが隠れ状態を読んで確率を返し、オフにするとモデルはビット単位で -it モデルそのものになり、自前の言語モデルヘッドが文章を書きます。そのため、メモリ上の1つのモデルが System One の判断と OpenAI 形式のチャットの両方を受け持ち、n8n や mem0 のようなアプリも判断と同じモデルを使えます。",
  frozen: "固定の重み、1回だけ読み込む", switchLabel: "LoRA アダプター: オン / オフ", on: "アダプター オン", off: "アダプター オフ",
  headSub: "選択肢ごとの q·k、÷ T", lmHead: "言語モデルヘッド", lmHeadSub: "-it モデル本来のもの",
  decisionOut: "較正済みの確率", chatOut: "チャットの文章、ツール、JSON",
  jobsFoot: "公開している v0.6 の -mlx-q8 / -mlx-q4 はアダプターを重みに合成済みのため、判断だけに答えます。QAT のビルドはアダプターを別に持ち、公開したままでチャットもできます。",
  jobsAria: "1つのモデル: 判断ではアダプターをオン、チャットではオフ",
  s3b: "判断はチャットを待たない",
  s3bbody: "2つの仕事は1本のモデルスレッドを共有します。チャットの生成中に届いた判断は、チャットのトークンとトークンの間、または長いプロンプトを読み込むチャンクの間に、アダプターをオンにして答え、終わったらオフに戻します。チャットの文章も判断の確率も、それぞれを単独で動かしたときと同じです。D1A-E4B-it では、200 トークンのチャット中の判断の待ち時間が 4〜5 秒から 0.24 秒になりました。",
  prefill: "プロンプト", tok: "トークン", decision: "判断", timeline: "モデルスレッドの時間の流れ",
  interleaveFoot: "破線: チャットのプロンプトの読み込み（プレフィル） · 実線: 生成したトークン · マゼンタ: 割り込む判断",
  interleaveAria: "チャットのプロンプトのチャンクとトークンの間に割り込む判断",
  s4: "4. スコア",
  s4body: "D1A のすべてのスイートで D1A-E4B-it と D1A-E2B-it を比べました。どちらも MLX 8 ビット、アダプター非合成、それぞれの較正温度で測定（2026-10-17）。E4B-it は 22 スイート中 21 で上回り（全体で +2.5 ポイント [+1.7, +3.4]）、下回ったのは「答えのない事実」のモニター1つだけです。代わりに、1回の判断にかかるモデル時間は E2B-it の約 2.9 倍です。",
  s4qat: <>D1A-E4B-it QAT と D1A-E4B-it v0.6 をすべてのスイートで比べました（MLX 4 ビットと 8 ビット、2026-10-28）。全体では同等（全体で −0.2 ポイント [−0.9, +0.5]）で、PR ラベル（+1.6）、PR の重大度（+6.0）、ルーティング（+1.7、+1.5）で上回り、外部の TypeSafe スイート（−7.8、4 ビットのトランクによるもの）で下回りました。すべてのスイートは<a className={link} href="https://github.com/jonpol01/d1a/blob/main/docs/reports/2026-10-28-e4b-it-qat-scorecard.md">スコアカード</a>にあります。</>,
  scoresLegend: "精度 %、軸は 60 から",
  scoresAria: "スイートごとの精度、E2B-it と E4B-it",
  s4table: [
    ["較正温度", "1.41", "1.55", "1.66"],
    ["ルーティング用の温度", "採用せず", "採用せず", "採用せず"],
    ["1回の判断のモデル時間", "1×", "約 2.9×", "約 2.9×"],
    ["写真・音声・動画（ゼロショット）", "対応", "対応、E2B-it が見逃す損傷も検出", "対応、デモの 28 回答中 26 が v0.6 と同じ"],
  ],
  s5: "5. ビルド",
  s5body: "各モデルは複数の形式で配布しています。PyTorch は Hub のトランクに載せるアダプターとヘッド（GPU・CPU どちらでも。QAT のビルドは読み込み時に 4 ビットのトランクを組み立てます）。MLX は Mac の GPU で動き、写真・音声・動画のエンコーダーも含みます。Core ML は Apple Neural Engine または GPU で動きます。v0.6 のビルドはテキストのみで 512 トークンまで、D1A-E2B-it QAT のものは Python の参照ランナーを通して GPU でチャットもし、写真・音声・動画も読みます。",
  colModel: "モデル", colPt: "PyTorch", colMlx8: "MLX 8 ビット", colMlx4: "MLX 4 ビット", colCm8: "Core ML int8", colCm4: "Core ML int4",
  builds: [
    ["D1A-E4B-it QAT", "アダプター", "—", "4.4 + 0.9 GB", "—", "未作成"],
    ["D1A-E4B-it v0.6", "アダプター", "6.1 + 0.9 GB", "3.9 + 0.9 GB", "見送り", "4.4 GB"],
    ["D1A-E4B v0.6.1", "アダプター", "6 + 1 GB", "—", "プレビュー", "—"],
    ["D1A-E2B-it QAT", "アダプター", "—", "2.9 + 0.9 GB", "—", "4.6 GB"],
    ["D1A-E2B-it v0.6", "アダプター", "3.5 + 0.9 GB", "2.5 + 0.9 GB", "3.5 GB", "2.6 GB"],
    ["D1A-E2B v0.6.1", "アダプター", "3.5 + 0.9 GB", "—", "あり", "—"],
    ["D1A-12B", "—", "計画中", "計画中", "—", "—"],
  ],
  buildsNote: "MLX のサイズ: モデル + 写真・音声・動画のエンコーダー。v0.6 の -it のチャット用ビルドはアダプターから手元で作ります（scripts/export_mlx.py --unmerged）。QAT のビルドはアダプター非合成のまま、Google の 4 ビットの格子そのままで公開しています（8 ビットや int8 のビルドはありません）。",
  s6: "6. 12B の計画",
  s6body: "D1A-12B は、4 ビット向けに学習（QAT）した Gemma 4 12B-it に D1A を載せ、判断・チャット・画像・音声を1つのモデルでこなす計画です。コードは準備済み（12B への移植と 4 ビット変換は統合済み）で、学習の試運転も2回とも成功しています。学習予算の承認まで保留中です。",
  plan: [
    ["トランク", "google/gemma-4-12B-it QAT · 48 層 · 隠れ次元 3,840 · 4 ビットで 7.4 GB"],
    ["学習", "48 GB の GPU（L40S）1基で約 10.8 時間、約 19.5 ドル。ピーク 32.7 GB"],
    ["公開の条件", "transfer-v4 で E4B より +3 ポイント、PR の重大度は E4B 以上、4 ビットの判断の変化は 42 問中 1 以下、アダプターを外したチャットは変化なし"],
    ["状況", "2026-10-14 から保留 · jonpol01/d1a#270"],
  ],
};

/* ------------------------------------------------------------------ page */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-xs md:p-8">
      <h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-4 text-[14px] leading-6 text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-foreground">{children}</div>
    </section>
  );
}

export function Models() {
  useHtmlLang();
  const t = useText<Text>({ en: EN, ja: JA } satisfies Record<Lang, Text>);
  const th = "px-3 py-2 font-normal";
  return (
    <div className="flex w-full flex-col">
      <div className="hero-glow">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 md:px-10">
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="d1a-wordmark font-heading text-2xl font-extrabold tracking-tight">D1A</span>
              <span className="font-heading text-[15px] font-medium tracking-tight">playground</span>
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/" className="rounded-full border border-border bg-background/70 px-3 py-1 text-[12px] text-muted-foreground shadow-xs backdrop-blur hover:text-foreground">← {t.back}</Link>
              <LangSwitch />
            </div>
          </header>
          <div className="max-w-3xl pt-14 pb-12 md:pt-20">
            <p className="font-mono text-[12px] text-muted-foreground">{t.kicker}</p>
            <h1 className="mt-2 font-heading text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl"><span className="d1a-wordmark">{t.title}</span></h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-7 text-muted-foreground">{t.intro}</p>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted-foreground">{t.credit}</p>
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 sm:px-6 md:px-10">
        <Section title={t.s1}><p>{t.s1body}</p><FamilyDiagram t={t} /></Section>
        <Section title={t.s2}><p>{t.s2body}</p><SizeDiagram t={t} /></Section>
        <Section title={t.s3}>
          <p>{t.s3body}</p>
          <TwoJobsDiagram t={t} />
          <h3 className="font-heading text-[15px] font-semibold text-foreground">{t.s3b}</h3>
          <p>{t.s3bbody}</p>
          <InterleaveDiagram t={t} />
        </Section>
        <Section title={t.s4}>
          <p>{t.s4body}</p>
          <ScoresChart t={t} />
          <p>{t.s4qat}</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-border text-left text-[12px]"><th className={th} /><th className={th}>D1A-E2B-it v0.6</th><th className={th}>D1A-E4B-it v0.6</th><th className={th}>D1A-E4B-it QAT</th></tr></thead>
              <tbody>
                {t.s4table.map(([k, a, b, c]) => (
                  <tr key={k} className="border-b border-border last:border-0"><td className="px-3 py-1.5 text-foreground">{k}</td><td className="px-3 py-1.5">{a}</td><td className="px-3 py-1.5">{b}</td><td className="px-3 py-1.5">{c}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title={t.s5}>
          <p>{t.s5body}</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-border text-left text-[12px]">{[t.colModel, t.colPt, t.colMlx8, t.colMlx4, t.colCm8, t.colCm4].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {t.builds.map((r, i) => (
                  <tr key={r[0]} className={`border-b border-border last:border-0 ${i === 0 ? "text-foreground" : ""}`}>
                    {r.map((c, j) => <td key={j} className={`px-3 py-1.5 ${j === 0 ? "font-medium text-foreground" : "tabular-nums"}`}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px]">{t.buildsNote}</p>
        </Section>
        <Section title={t.s6}>
          <p>{t.s6body}</p>
          <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[9rem_minmax(0,1fr)]">
            {t.plan.map(([k, v]) => <div key={k} className="contents"><dt className="font-medium text-foreground">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Section>
        <p className="text-center"><LicensesLink /></p>
      </main>
    </div>
  );
}
