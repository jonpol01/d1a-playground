"use client";

import { useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import { api, START_HINT } from "@/lib/kev";
import { BulkDemo, InboxDemo, RerankDemo } from "@/components/uses/batch";
import { ControlDemo } from "@/components/uses/control";
import { EvalsDemo, GateDemo, GuardrailsDemo, RoutingDemo, ToolGateDemo } from "@/components/uses/single";

type Demo = { id: string; title: string; line: string; Component: ComponentType };

const DEMOS: Demo[] = [
  { id: "routing", title: "Model routing", line: "Kev reads the user's prompt and rates how hard it is, which picks the model tier; the probabilities show when a call is close enough to send up a tier.", Component: RoutingDemo },
  { id: "guardrails", title: "Guardrails", line: "Kev labels an incoming message and says whether it should reach the LLM at all; a probability lets you block only when the model is sure and log the rest.", Component: GuardrailsDemo },
  { id: "tools", title: "Tool-call gating", line: "Kev reads an agent's proposed tool call and decides allow, ask or deny against a written policy; p(deny) is the number to alert on.", Component: ToolGateDemo },
  { id: "inbox", title: "Inbox triage", line: "Kev reads each email and decides reply now, later or archive; the probability orders the inbox so the most certain urgent mail is on top.", Component: InboxDemo },
  { id: "rerank", title: "Reranking", line: "Kev reads each retrieved passage and answers whether it answers the query; p(yes) is a relevance score you can sort by and cut off.", Component: RerankDemo },
  { id: "evals", title: "LLM evals", line: "Kev grades an LLM answer from 1 to 5; the expected grade and its spread tell a confident 3 from a coin toss between 1 and 5.", Component: EvalsDemo },
  { id: "labeling", title: "Bulk labeling", line: "Kev labels every row of a table; the confidence column tells you which rows a human should look at.", Component: BulkDemo },
  { id: "control", title: "Real-time control", line: "Kev reads a text description of the world every tick and picks the next move; each decision is one short forward pass.", Component: ControlDemo },
  { id: "gate", title: "Confidence gate", line: "Kev answers one question with a calibrated probability, and your thresholds decide whether to act, act and confirm, or ask a human.", Component: GateDemo },
];

// The selected demo lives in the URL hash (#routing, #guardrails, ...) so a demo can be linked to directly.
function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const getHash = () => window.location.hash.slice(1);
const getServerHash = () => "";

type ModelInfo = { run: string; base: string; device?: string; backend?: string } | { error: string } | null;

export function UseCases() {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const idx = Math.max(0, DEMOS.findIndex((d) => d.id === hash));
  const demo = DEMOS[idx];
  const [model, setModel] = useState<ModelInfo>(null);

  useEffect(() => {
    api.models().then((m) => setModel(m.models[0])).catch((e: Error) => setModel({ error: e.message }));
  }, []);

  const down = model !== null && "error" in model;
  const lmstudio = model !== null && !("error" in model) && model.backend === "lmstudio";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-6 pt-8 pb-16 md:px-10">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-[15px] font-medium tracking-tight">kev · use cases</h1>
        <p className="text-[13px] text-muted-foreground">
          {model === null ? "connecting" : "error" in model ? "Kev server not reachable" : <><span className="font-mono">{model.run}</span> · <span className="font-mono">{model.base}</span>{model.device ? <> · {model.device}</> : null}</>}
        </p>
      </header>

      {down && (
        <p role="alert" className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-[13px] leading-5 text-destructive">
          The Kev server is not answering on port 8009, so the demos cannot run. {START_HINT}
        </p>
      )}
      {lmstudio && (
        <p className="mt-6 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-[13px] leading-5">
          LM Studio mode: answers come from a prompted chat model, not the trained Kev checkpoint. Probabilities are the chat model&apos;s letter probabilities, uncalibrated.
        </p>
      )}

      <div className="mt-10 max-w-3xl">
        <h2 className="text-2xl font-medium tracking-tight">Nine jobs for a small decision model.</h2>
        <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
          Each demo sends one document and a few typed questions to a live Kev server and gets back a probability for every option, usually in well under a second.
          Every example is editable. What the app does with the probabilities (route, block, sort, grade, move) is ordinary code on top.
        </p>
      </div>

      <nav aria-label="Use cases" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {DEMOS.map((d, i) => (
          <a key={d.id} href={`#${d.id}`} aria-current={i === idx ? "page" : undefined}
            className={`border-b pb-0.5 transition-colors ${i === idx ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <span className="mr-1 tabular-nums text-muted-foreground">{i + 1}</span>{d.title}
          </a>
        ))}
      </nav>

      <section aria-labelledby="demo-title" className="mt-8">
        <h3 id="demo-title" className="text-lg font-medium tracking-tight">{idx + 1}. {demo.title}</h3>
        <p className="mt-1 max-w-3xl text-[14px] leading-6 text-muted-foreground">{demo.line}</p>
        <div className="mt-6"><demo.Component key={demo.id} /></div>
      </section>

      <section aria-labelledby="about" className="mt-16 max-w-3xl border-t border-border pt-8">
        <h2 id="about" className="text-base font-medium tracking-tight">About Kev</h2>
        <div className="mt-2 flex flex-col gap-3 text-[14px] leading-6 text-muted-foreground">
          <p>
            The answers come from a trained Kev checkpoint, <a className="text-foreground underline underline-offset-2" href="https://huggingface.co/JohnP1/kev-gemma4-e2b">JohnP1/kev-gemma4-e2b</a>: a LoRA adapter and a pointer head on Google&apos;s Gemma 4 E2B.
            It is not a chat model. It reads the document once, answers every question in parallel without letting the questions see each other, and returns a calibrated probability for each option you offer. There is no generated text to parse.
          </p>
          <p>
            Kev is by Jared Palmer (<a className="text-foreground underline underline-offset-2" href="https://github.com/jaredpalmer/kev">jaredpalmer/kev</a>, Apache-2.0). This checkpoint and the Gemma 4 support come from the fork <a className="text-foreground underline underline-offset-2" href="https://github.com/jonpol01/kev">jonpol01/kev</a>.
            It is a one-epoch prototype, trained on English data: expect mistakes, and read the probabilities as its confidence, not as ground truth.
          </p>
        </div>
      </section>
    </div>
  );
}
