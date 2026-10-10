"use client";
import { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/d1a";

// The Learning page (d1a#233): the self-learning settings with an edit form, and what the loop is doing. Every change goes
// through d1a's own validation (`config set --source page`); a value out of range is refused and nothing is written.
type Settings = Record<string, Record<string, unknown>>;
type Report = { ts: number; model_change?: { from: string | null; to: string }; settings_error?: string; server?: string; reached_min?: string[];
  replay?: { replayed?: number; left?: number; excluded?: Record<string, number>; refused?: string; paused?: boolean; error?: string };
  gate?: { reason?: string; skipped?: string; outcomes?: number; replayed?: number; promoted?: string[]; written?: boolean; auto?: boolean; power?: string } };
type State = { source: string; error: string | null; settings: Settings | null; logging: boolean;
  changes: { ts: number; key: string; old: unknown; new: unknown; source: string }[];
  status: { run?: string; last_gate?: number; replay_complete?: boolean; per_question: Record<string, { outcomes: number; fit: number; needs: number }>; reports: Report[] } | null };

// what each setting means, in the order the page shows them (flags are #237's and are not edited here)
const FIELDS: [string, string][] = [
  ["outcomes.enabled", "Collect outcomes (the review bot's and people's labels)"],
  ["outcomes.sources", "Outcome sources that count (comma-separated; empty = all)"],
  ["promotion.auto", "Promote automatically (off: the gate runs and reports, the calibrator is never written)"],
  ["promotion.questions", "Questions that learn (comma-separated; empty = all)"],
  ["promotion.min_outcomes", "Fit outcomes a question needs before it learns (≥ 10)"],
  ["promotion.held_out", "Share of pull requests the gate holds out (0.1–0.5)"],
  ["promotion.ci_level", "Gate interval (0.9, 0.95 or 0.99)"],
  ["schedule.daily_at", "Run the gate daily after (HH:MM, this machine's time; empty = never)"],
  ["schedule.after_new_outcomes", "…or after this many new outcomes (≥ 1; empty = never)"],
  ["replay.enabled", "Replay earlier outcomes when the model changes"],
  ["replay.per_tick_cap", "Replays per 15-minute tick (1–500)"],
];
const time = (ts?: number) => (ts ? new Date(ts * 1000).toLocaleString() : "never");
const get = (s: Settings, key: string) => { const [a, b] = key.split("."); return s[a]?.[b]; };

function show(v: unknown) { return Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : String(v); }
function parse(key: string, text: string, was: unknown): unknown {
  const t = text.trim();
  if (typeof was === "boolean") return t === "true";
  if (key.endsWith(".sources") || key.endsWith(".questions")) return t ? t.split(",").map((x) => x.trim()).filter(Boolean) : null;
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

export function Learning() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`${BASE_PATH}/api/learning`, { cache: "no-store" });
    const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (!r.ok) { setError(body.error ?? `HTTP ${r.status}`); return; }
    setData(body); setError("");
  }, []);
  useEffect(() => { const first = setTimeout(() => void load(), 0); return () => clearTimeout(first); }, [load]);

  async function save() {
    if (!data?.settings) return;
    const set = Object.fromEntries(Object.entries(edit).map(([k, t]) => [k, parse(k, t, get(data.settings!, k))]));
    if (!Object.keys(set).length) return;
    setBusy(true); setNote("");
    const r = await fetch(`${BASE_PATH}/api/learning`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set }) });
    const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    setBusy(false);
    if (!r.ok) { setNote(`Not saved: ${body.error}`); return; }
    setNote(`Saved: ${(body.changed ?? []).join("; ") || "no change"}. It takes effect on the next tick.`); setEdit({}); await load();
  }

  if (error && !data) return <Shell><p className="text-sm text-destructive">{error}</p></Shell>;
  if (!data?.settings) return <Shell><p className="text-sm text-muted-foreground">Loading…</p></Shell>;
  const s = data.settings, st = data.status, perQ = Object.entries(st?.per_question ?? {});

  return (
    <Shell>
      <section className="space-y-2 rounded-lg border border-border p-4 text-[13px]" data-testid="learning-status">
        <h2 className="font-medium">Now</h2>
        <p>Model: <span className="font-mono">{st?.run ?? "not seen yet"}</span>. Last gate: {time(st?.last_gate)}.
          {st && !st.replay_complete && " Replay of earlier outcomes is not finished (see the reports)."}</p>
        <p className="text-muted-foreground">Decision logging is {data.logging ? "on" : "off"}. It is not a setting here: the PR label check and the
          outcome poster read that log, so it stays a model server setting (D1A_FEEDBACK_LOG).</p>
        {perQ.length ? (
          <table className="w-full text-left">
            <thead className="text-muted-foreground"><tr><th className="font-normal">Question</th><th className="font-normal">Outcomes</th><th className="font-normal">Fit side</th><th className="font-normal">Still needs</th></tr></thead>
            <tbody>{perQ.map(([q, v]) => <tr key={q}><td className="font-mono">{q}</td><td>{v.outcomes}</td><td>{v.fit}</td><td>{v.needs || "ready"}</td></tr>)}</tbody>
          </table>
        ) : <p className="text-muted-foreground">No outcomes for the served model yet.</p>}
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4 text-[13px]">
        <h2 className="font-medium">Settings</h2>
        <p className="text-muted-foreground">From {data.source}.{data.error && <span className="text-destructive"> The file has an error, so the last valid settings are in force: {data.error}</span>}</p>
        {FIELDS.map(([key, label]) => {
          const was = get(s, key), value = edit[key] ?? show(was);
          return (
            <label key={key} className="flex flex-wrap items-center justify-between gap-2">
              <span>{label}</span>
              {typeof was === "boolean" ? (
                <input type="checkbox" checked={value === "true"} onChange={(e) => setEdit({ ...edit, [key]: String(e.target.checked) })} />
              ) : (
                <input className="w-48 rounded-md border border-border bg-transparent px-2 py-1 font-mono text-[12px]" value={value}
                       onChange={(e) => setEdit({ ...edit, [key]: e.target.value })} />
              )}
            </label>
          );
        })}
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={busy || !Object.keys(edit).length} className="h-8 rounded-md bg-primary px-3 text-[13px] text-primary-foreground disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          {Object.keys(edit).length > 0 && <button type="button" className="text-[12px] text-muted-foreground" onClick={() => setEdit({})}>Discard</button>}
          {note && <span className={note.startsWith("Not saved") ? "text-destructive" : "text-muted-foreground"}>{note}</span>}
        </div>
      </section>

      <section className="space-y-2 text-[13px]">
        <h2 className="font-medium">Recent runs</h2>
        {(st?.reports ?? []).length === 0 && <p className="text-muted-foreground">The 15-minute tick has not reported yet.</p>}
        {(st?.reports ?? []).map((r) => (
          <div key={r.ts} className="rounded-md border border-border p-2">
            <p className="text-muted-foreground">{time(r.ts)}{r.model_change && ` · model changed to ${r.model_change.to}`}{r.server && ` · ${r.server}`}</p>
            {r.settings_error && <p className="text-destructive">Settings error, last valid ones used: {r.settings_error}</p>}
            {r.replay && <p>Replay: {r.replay.refused ? `refused (${r.replay.refused})` : r.replay.error ? `error (${r.replay.error})` :
              `${r.replay.replayed} replayed, ${r.replay.left} left${r.replay.paused ? ", paused for live requests" : ""}` +
              (r.replay.excluded && Object.keys(r.replay.excluded).length ? `; excluded: ${Object.entries(r.replay.excluded).map(([k, n]) => `${n} ${k}`).join(", ")}` : "")}</p>}
            {r.gate && <p>Gate ({r.gate.reason}): {r.gate.skipped ?? `${r.gate.outcomes} outcomes (${r.gate.replayed} replayed); ` +
              (r.gate.promoted?.length ? `promoted ${r.gate.promoted.join(", ")}${r.gate.written ? "" : " (not written: automatic promotion is off)"}` : "nothing promoted")}</p>}
            {r.gate?.power && <p className="font-mono text-[11px] text-muted-foreground">{r.gate.power}</p>}
            {r.reached_min && <p>Reached the minimum: {r.reached_min.join(", ")}</p>}
          </div>
        ))}
      </section>

      <section className="space-y-1 text-[13px]">
        <h2 className="font-medium">Changes</h2>
        {data.changes.length === 0 ? <p className="text-muted-foreground">None yet.</p> : data.changes.map((c, i) => (
          <p key={i} className="font-mono text-[12px]">{time(c.ts)} · {c.source} · {c.key}: {JSON.stringify(c.old)} → {JSON.stringify(c.new)}</p>
        ))}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Learning</h1>
        <p className="text-[13px] leading-5 text-muted-foreground">
          How D1A learns from the labels its PR decisions get: which outcomes count, when the promotion gate runs, and what it decided.
          A calibrator is promoted only when it is clearly better on pull requests it was not fitted on.
        </p>
      </header>
      {children}
    </main>
  );
}
