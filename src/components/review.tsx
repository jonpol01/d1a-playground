"use client";
import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/kev";
import { QUESTIONS, UNSURE, type Item, type Question } from "@/lib/review";

// The human check of the PR labeler's labels (d1a-playground#29): one pull request at a time, D1A's and the reviewer's
// label per question, and John's pick (or "unsure"), posted through /api/review to the model server as src=human.
type State = { target: number; done: number; items: Item[]; pool: { resolved: number; disagree: number } };
const NAMES: Record<Question, string> = { type: "Change type", blast: "Blast radius", sev: "Severity" };

export function Review() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<Record<string, Partial<Record<Question, string>>>>({});   // per decision, until saved
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);   // the decision whose whole body is shown

  const load = useCallback(async (next?: number) => {
    const r = await fetch(`${BASE_PATH}/api/review`, { cache: "no-store" });
    const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok) { setError(body.error ?? `HTTP ${r.status}`); return; }
    setData(body); setError("");
    const open = (body as State).items.findIndex((i) => !i.human);
    setAt(next ?? (open < 0 ? 0 : open));
  }, []);
  useEffect(() => { const first = setTimeout(() => void load(), 0); return () => clearTimeout(first); }, [load]);

  const item = data?.items[at];
  const picks = item ? chosen[item.decision_id] ?? item.human ?? {} : {};

  async function submit() {
    if (!item) return;
    setBusy(true);
    const labels = Object.fromEntries(QUESTIONS.map((q) => [q, picks[q] ?? UNSURE]));
    const r = await fetch(`${BASE_PATH}/api/review`, { method: "POST", headers: { "Content-Type": "application/json" },
                                                       body: JSON.stringify({ decision_id: item.decision_id, labels }) });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(body.error ?? `HTTP ${r.status}`); return; }
    const open = data!.items.findIndex((i, k) => k > at && !i.human);
    await load(open < 0 ? at : open);
  }

  if (error && !data) return <Shell><p className="text-sm text-destructive">{error}</p></Shell>;
  if (!data) return <Shell><p className="text-sm text-muted-foreground">Loading…</p></Shell>;
  if (!item) return <Shell><p className="text-sm text-muted-foreground">No reviewer-resolved PR decisions yet.</p></Shell>;
  const [owner, number] = item.group.split("#");

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
        <span><b data-testid="review-progress">{data.done} / {data.target}</b> checked{data.items.length < data.target && ` (${data.items.length} available so far)`}</span>
        <span className="text-muted-foreground">{data.pool.resolved} resolved PRs, {data.pool.disagree} where D1A and the reviewer disagree</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${(100 * data.done) / data.target}%` }} /></div>

      <nav className="flex items-center gap-2 text-[13px]">
        <button type="button" className={navCls} disabled={at === 0} onClick={() => setAt(at - 1)}>←</button>
        <span>{at + 1} of {data.items.length}</span>
        <button type="button" className={navCls} disabled={at + 1 >= data.items.length} onClick={() => setAt(at + 1)}>→</button>
        {item.human && <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 text-[12px]">checked</span>}
      </nav>

      <article className="space-y-2 rounded-lg border border-border p-4">
        <a className="text-[13px] text-muted-foreground underline-offset-4 hover:underline" href={`https://github.com/${owner}/pull/${number}`} target="_blank" rel="noreferrer">{item.group}</a>
        <h2 className="text-lg font-semibold leading-snug">{item.pr.title}</h2>
        <p className="font-mono text-[12px] text-muted-foreground">{item.pr.author} · {item.pr.stats}</p>
        {item.pr.body ? (
          <div>
            <p className={`whitespace-pre-wrap text-[13px] leading-5 ${expanded === item.decision_id ? "" : "line-clamp-[12]"}`}>{item.pr.body}</p>
            {item.pr.body.split("\n").length > 12 || item.pr.body.length > 900 ? (
              <button type="button" className="mt-1 text-[12px] text-muted-foreground underline-offset-4 hover:underline"
                      onClick={() => setExpanded(expanded === item.decision_id ? null : item.decision_id)}>
                {expanded === item.decision_id ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
        ) : <p className="text-[13px] text-muted-foreground">(no description)</p>}
        {item.pr.files && (
          <details open className="text-[12px]">
            <summary className="cursor-pointer text-muted-foreground">Changed files</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-5">{item.pr.files}</pre>
          </details>
        )}
      </article>

      {QUESTIONS.map((q) => (
        <fieldset key={q} className="space-y-2">
          <legend className="text-[13px] font-medium">{NAMES[q]}{q === "sev" && <span className="font-normal text-muted-foreground"> (the reviewer does not set severity)</span>}</legend>
          <div className="flex flex-wrap gap-2">
            {[...item.options[q], UNSURE].map((o) => {
              const marks = [o === item.d1a[q] && "D1A", o === item.reviewer[q] && "reviewer"].filter(Boolean).join(" · ");
              const on = (picks[q] ?? UNSURE) === o;
              return (
                <button key={o} type="button" aria-pressed={on} onClick={() => setChosen({ ...chosen, [item.decision_id]: { ...picks, [q]: o } })}
                        className={`rounded-md border px-2.5 py-1 text-left font-mono text-[12px] ${on ? "border-primary bg-primary/10" : "border-border hover:border-(--demo-line)"}`}>
                  {o}{marks && <span className="ml-1.5 font-sans text-[11px] text-muted-foreground">{marks}</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={busy} className="h-8 rounded-md bg-primary px-3 text-[13px] text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : item.human ? "Save again" : "Save and next"}
        </button>
        {error && <span className="text-[13px] text-destructive">{error}</span>}
      </div>
    </Shell>
  );
}

const navCls = "h-7 rounded-md border border-border px-2 disabled:opacity-40";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">PR label check</h1>
        <p className="text-[13px] leading-5 text-muted-foreground">
          Pick the correct label for each question, or &ldquo;unsure&rdquo; to leave the reviewer&rsquo;s standing. Each answer goes to the
          model server&rsquo;s decision log as a human outcome, which outranks the review bot&rsquo;s.
        </p>
      </header>
      {children}
    </main>
  );
}
