"use client";

import { useEffect, useState, useSyncExternalStore, type ComponentType, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Gamepad2, Gauge, Inbox, ListOrdered, Route, ShieldCheck, Star, Tags, Wrench, type LucideIcon } from "lucide-react";
import { api, START_HINT } from "@/lib/kev";
import { BulkDemo, InboxDemo, RerankDemo } from "@/components/uses/batch";
import { ControlDemo } from "@/components/uses/control";
import { EvalsDemo, GateDemo, GuardrailsDemo, RoutingDemo, ToolGateDemo } from "@/components/uses/single";

type Demo = {
  id: string; title: string; line: string; caption: string; accent: string; Icon: LucideIcon;
  input: string; outcomes: string[]; Component: ComponentType;
};

const DEMOS: Demo[] = [
  { id: "routing", title: "Model routing", accent: "#7c3aed", Icon: Route, input: "prompt", outcomes: ["small", "medium", "large"], caption: "Send each prompt to the cheapest model that can handle it.",
    line: "The model reads the user's prompt and rates how hard it is, which picks the model tier; the probabilities show when a call is close enough to send up a tier.", Component: RoutingDemo },
  { id: "guardrails", title: "Guardrails", accent: "#059669", Icon: ShieldCheck, input: "message", outcomes: ["allow", "block"], caption: "Stop prompt injection and abuse before they reach the LLM.",
    line: "The model labels an incoming message and says whether it should reach the LLM at all; a probability lets you block only when the model is sure and log the rest.", Component: GuardrailsDemo },
  { id: "tools", title: "Tool-call gating", accent: "#d97706", Icon: Wrench, input: "tool call", outcomes: ["allow", "ask", "deny"], caption: "Decide which agent actions run, need a human, or never happen.",
    line: "The model reads an agent's proposed tool call and decides allow, ask or deny against a written policy; p(deny) is the number to alert on.", Component: ToolGateDemo },
  { id: "inbox", title: "Inbox triage", accent: "#0284c7", Icon: Inbox, input: "email", outcomes: ["reply now", "later", "archive"], caption: "Sort a pile of email into what needs you today.",
    line: "The model reads each email and decides reply now, later or archive; the probability orders the inbox so the most certain urgent mail is on top.", Component: InboxDemo },
  { id: "rerank", title: "Reranking", accent: "#c026d3", Icon: ListOrdered, input: "passage + query", outcomes: ["p(relevant)"], caption: "Re-order search results by whether they answer the question.",
    line: "The model reads each retrieved passage and answers whether it answers the query; p(yes) is a relevance score you can sort by and cut off.", Component: RerankDemo },
  { id: "evals", title: "LLM evals", accent: "#ea580c", Icon: Star, input: "Q + answer", outcomes: ["1", "2", "3", "4", "5"], caption: "Grade LLM answers with a score and a spread, not a guess.",
    line: "The model grades an LLM answer from 1 to 5; the expected grade and its spread tell a confident 3 from a coin toss between 1 and 5.", Component: EvalsDemo },
  { id: "labeling", title: "Bulk labeling", accent: "#0d9488", Icon: Tags, input: "table row", outcomes: ["positive", "neutral", "negative"], caption: "Label a whole table and flag the rows a human should check.",
    line: "The model labels every row of a table; the p(label) column tells you which rows a human should look at.", Component: BulkDemo },
  { id: "control", title: "Real-time control", accent: "#e11d48", Icon: Gamepad2, input: "world state", outcomes: ["left", "stay", "right"], caption: "Steer a robot with one fast decision per tick.",
    line: "The model reads a text description of the world every tick and picks the next move; each decision is one short forward pass.", Component: ControlDemo },
  { id: "gate", title: "Confidence gate", accent: "#4f46e5", Icon: Gauge, input: "any text", outcomes: ["act", "confirm", "human"], caption: "Act when sure, confirm when unsure, escalate otherwise.",
    line: "The model answers one question with a calibrated probability, and your thresholds decide whether to act, act and confirm, or ask a human.", Component: GateDemo },
];

// The selected demo lives in the URL hash (#routing, #guardrails, ...) so a demo can be linked to directly; no hash = the overview.
function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const getHash = () => window.location.hash.slice(1);
const getServerHash = () => "";

type ModelInfo = { run: string; base: string; device?: string; backend?: string } | { error: string } | null;
// Accent-coloured text, lifted toward white in dark mode so it keeps its contrast on dark cards.
const ACCENT_TEXT = "text-(--demo) dark:text-[color-mix(in_oklch,var(--demo)_60%,white)]";
const accentStyle = (accent: string) => ({ "--demo": accent } as CSSProperties);

function StatusPill({ model }: { model: ModelInfo }) {
  const state = model === null ? "wait" : "error" in model ? "down" : model.backend === "lmstudio" ? "lm" : "up";
  const dot = { wait: "bg-slate-400", down: "bg-rose-500", lm: "bg-amber-500", up: "bg-emerald-500" }[state];
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-[12px] shadow-xs backdrop-blur">
      <span className="relative flex size-2 shrink-0">
        {state === "up" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${dot}`} />
      </span>
      <span className="truncate">
        {model === null ? "connecting to the model server…" : "error" in model ? "model server not reachable" : (
          <>{state === "lm" ? "LM Studio mode" : "server connected"} · <span className="font-mono">{model.run}</span> · <span className="font-mono">{model.base}</span>{model.device ? <> · {model.device}</> : null}</>
        )}
      </span>
    </span>
  );
}

function MiniFlow({ d }: { d: Demo }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]" aria-hidden>
      <span className="shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 text-muted-foreground">{d.input}</span>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
      <span className="shrink-0 rounded-md px-1.5 py-0.5 font-heading font-bold text-white" style={{ background: d.accent }}>D1A</span>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-wrap gap-1">
        {d.outcomes.map((o) => <span key={o} className={`rounded-md bg-(--demo-soft) px-1.5 py-0.5 font-mono ${ACCENT_TEXT}`}>{o}</span>)}
      </span>
    </div>
  );
}

function DemoCard({ d, n }: { d: Demo; n: number }) {
  return (
    <a href={`#${d.id}`} onClick={() => window.scrollTo({ top: 0 })} style={accentStyle(d.accent)}
      className="demo-accent group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-(--demo-line) hover:shadow-xl focus-visible:ring-[3px] focus-visible:ring-(--demo-line) focus-visible:outline-none">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: d.accent }} aria-hidden />
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-(--demo-soft) ${ACCENT_TEXT}`}><d.Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground">{String(n).padStart(2, "0")}</p>
          <h3 className="font-heading text-lg leading-tight font-semibold tracking-tight">{d.title}</h3>
        </div>
        <ArrowRight className={`ml-auto size-4 transition-transform group-hover:translate-x-1 ${ACCENT_TEXT}`} aria-hidden />
      </div>
      <p className="text-[13px] leading-5 text-muted-foreground">{d.caption}</p>
      <MiniFlow d={d} />
    </a>
  );
}

function About() {
  return (
    <section aria-labelledby="about" className="mt-20 rounded-3xl border border-border bg-card p-6 shadow-xs md:p-8">
      <h2 id="about" className="font-heading text-xl font-semibold tracking-tight">About D1A</h2>
      <div className="mt-3 grid gap-4 text-[14px] leading-6 text-muted-foreground md:grid-cols-2">
        <p>
          D1A is a family of small decision models built on Kev. Until the D1A models ship, the answers here come from the Gemma 4 E2B prototype <a className="font-medium text-foreground underline underline-offset-2" href="https://huggingface.co/JohnP1/kev-gemma4-e2b">JohnP1/kev-gemma4-e2b</a>: a LoRA adapter and a pointer head on Google&apos;s Gemma 4 E2B.
          It is not a chat model. It reads the document once, answers every question in parallel without letting the questions see each other, and returns a calibrated probability for each option you offer. There is no generated text to parse.
        </p>
        <p>
          Built on Kev by Jared Palmer (<a className="font-medium text-foreground underline underline-offset-2" href="https://github.com/jaredpalmer/kev">jaredpalmer/kev</a>, Apache-2.0). The Gemma 4 support and the checkpoint come from the fork <a className="font-medium text-foreground underline underline-offset-2" href="https://github.com/jonpol01/kev">jonpol01/kev</a>.
          D1A is not affiliated with or endorsed by Jared Palmer or the Kev project.
          The checkpoint is a one-epoch prototype trained on English data: expect mistakes, and read the probabilities as its confidence, not as ground truth.
        </p>
      </div>
    </section>
  );
}

export function UseCases() {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const idx = DEMOS.findIndex((d) => d.id === hash);
  const demo = idx >= 0 ? DEMOS[idx] : null;
  const [model, setModel] = useState<ModelInfo>(null);

  useEffect(() => {
    api.models().then((m) => setModel(m.models[0])).catch((e: Error) => setModel({ error: e.message }));
  }, []);

  const down = model !== null && "error" in model;
  const lmstudio = model !== null && !("error" in model) && model.backend === "lmstudio";

  return (
    <div className="flex w-full flex-col">
      <div className="hero-glow">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 md:px-10">
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <a href="#" onClick={() => window.scrollTo({ top: 0 })} className="flex items-baseline gap-2">
              <span className="d1a-wordmark font-heading text-2xl font-extrabold tracking-tight">D1A</span>
              <span className="font-heading text-[15px] font-medium tracking-tight">playground</span>
            </a>
            <StatusPill model={model} />
          </header>

          {!demo && (
            <div className="max-w-3xl pt-14 pb-12 md:pt-20">
              <h1 className="font-heading text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl">
                Nine jobs for a <span className="d1a-wordmark">small decision model</span>.
              </h1>
              <p className="mt-5 max-w-2xl text-[16px] leading-7 text-muted-foreground md:text-[17px]">
                One document and a few typed questions in, a calibrated probability for every option out, in well under a second. Pick a use case: every example is live and editable.
              </p>
            </div>
          )}
          {demo && <div className="h-6" />}
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 md:px-10">
        {down && (
          <p role="alert" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-[13px] leading-5 text-destructive">
            The model server is not answering on port 8009, so the demos cannot run. {START_HINT}
          </p>
        )}
        {lmstudio && (
          <p className="mb-6 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-[13px] leading-5">
            LM Studio mode: answers come from a prompted chat model, not the trained checkpoint. Probabilities are the chat model&apos;s letter probabilities, uncalibrated.
          </p>
        )}

        {!demo && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEMOS.map((d, i) => <DemoCard key={d.id} d={d} n={i + 1} />)}
          </div>
        )}

        {demo && (
          <div className="demo-accent" style={accentStyle(demo.accent)}>
            <nav aria-label="Use cases" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
              <a href="#" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" aria-hidden />All</a>
              {DEMOS.map((d, i) => (
                <a key={d.id} href={`#${d.id}`} aria-current={i === idx ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors ${i === idx ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground"}`}
                  style={i === idx ? { background: d.accent } : undefined}>
                  {i !== idx && <span className="size-2 rounded-full" style={{ background: d.accent }} aria-hidden />}
                  {d.title}
                </a>
              ))}
            </nav>

            <section aria-labelledby="demo-title" className="mt-6">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-md" style={{ background: demo.accent }}><demo.Icon className="size-6" aria-hidden /></span>
                <div className="min-w-0">
                  <h2 id="demo-title" className="font-heading text-2xl font-bold tracking-tight md:text-3xl"><span className="text-muted-foreground">{idx + 1}.</span> {demo.title}</h2>
                  <p className="mt-1 max-w-3xl text-[14px] leading-6 text-muted-foreground">{demo.line}</p>
                </div>
              </div>
              <div className="mt-8"><demo.Component key={demo.id} /></div>
            </section>
          </div>
        )}

        <About />
      </main>
    </div>
  );
}
