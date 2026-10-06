// The human check of the PR labeler's labels (/review, d1a-playground#29): which decisions to show, what of them leaves
// the server, and which answers are forwarded to the model server's POST /v1/feedback. No I/O here: the route reads the
// logs and passes their text in, so this runs the same under `node --test` (scripts/test_review.mjs).

export const TARGET = 50;                                   // decisions John checks by hand
export const QUESTIONS = ["type", "blast", "sev"] as const;  // the labeler's three choice questions
export const REVIEWED = ["type", "blast"];                  // the review bot re-decides these; it never sets P0-P4
export const UNSURE = "unsure";
const BODY_CHARS = 700;

export type Question = (typeof QUESTIONS)[number];
type Event = { kind: string; id: string; ts: number; state?: unknown; questions?: Record<string, { criteria?: Record<string, unknown> }>;
  answers?: Record<string, { choice?: string }>; labels?: Record<string, unknown>; meta?: { src?: string; group?: string } };
type Call = { decision_id?: string; repo?: string; number?: number };

export type Item = {
  decision_id: string;
  group: string;                                          // "<repo>#<number>"
  disagree: boolean;                                      // D1A and the reviewer differ on type or blast
  pr: { title: string; author: string; stats: string; body: string };
  options: Record<Question, string[]>;
  d1a: Record<Question, string | null>;
  reviewer: Partial<Record<Question, string>>;
  human: Partial<Record<Question, string>> | null;        // already checked: the latest human outcome's labels
};

export function parseJsonl<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as T); } catch { /* a line still being appended */ }
  }
  return out;
}

/** The PR document's header fields and the start of its body (the labeler's state: "title: ...\nauthor: ...\nstats: ...\nbody:\n..."). */
export function prFields(state: unknown) {
  const text = typeof state === "string" ? state : "";
  const field = (name: string) => text.match(new RegExp(`^${name}: (.*)$`, "m"))?.[1]?.trim() ?? "";
  const at = text.indexOf("\nbody:");
  const body = at < 0 ? "" : text.slice(at + 6).trim();
  return { title: field("title"), author: field("author"), stats: field("stats"),
           body: body.length > BODY_CHARS ? body.slice(0, BODY_CHARS).trimEnd() + " …" : body };
}

/** FNV-1a: a stable order that does not depend on when a decision arrived. */
function rank(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/** The latest reviewer-resolved labeler decision of each pull request, as Items. `calls` (the labeler's call log) names the
 *  pull request of decisions whose outcomes carry no group. */
export function candidates(decisionLog: Event[], calls: Call[] = []): Item[] {
  const decisions = new Map<string, Event>(), outcomes = new Map<string, Event[]>();
  for (const e of decisionLog) {
    if (e.kind === "decision") decisions.set(e.id, e);
    else if (e.kind === "outcome") outcomes.set(e.id, [...(outcomes.get(e.id) ?? []), e]);
  }
  const prOf = new Map(calls.filter((c) => c.decision_id && c.repo && c.number).map((c) => [c.decision_id!, `${c.repo}#${c.number}`]));
  const latest = new Map<string, Item & { ts: number }>();
  for (const [id, outs] of outcomes) {
    const d = decisions.get(id);
    if (!d || !QUESTIONS.every((q) => d.questions?.[q]?.criteria)) continue;   // not a labeler decision
    const sorted = [...outs].sort((a, b) => a.ts - b.ts);
    const reviewer: Partial<Record<Question, string>> = {};
    let human: Partial<Record<Question, string>> | null = null;
    for (const o of sorted) {
      const labels = Object.fromEntries(Object.entries(o.labels ?? {}).filter(([q, v]) => (QUESTIONS as readonly string[]).includes(q) && typeof v === "string")) as Partial<Record<Question, string>>;
      if (o.meta?.src === "reviewer") Object.assign(reviewer, labels);
      else if (o.meta?.src === "human") human = { ...(human ?? {}), ...labels };
    }
    if (!REVIEWED.some((q) => reviewer[q as Question])) continue;               // not resolved by the reviewer
    const group = [...sorted].reverse().find((o) => o.meta?.group)?.meta?.group ?? prOf.get(id);
    if (!group) continue;
    const d1a = Object.fromEntries(QUESTIONS.map((q) => [q, d.answers?.[q]?.choice ?? null])) as Record<Question, string | null>;
    const item = {
      decision_id: id, group, ts: d.ts, pr: prFields(d.state), d1a, reviewer, human,
      disagree: REVIEWED.some((q) => reviewer[q as Question] != null && reviewer[q as Question] !== d1a[q as Question]),
      options: Object.fromEntries(QUESTIONS.map((q) => [q, Object.keys(d.questions![q].criteria!)])) as Record<Question, string[]>,
    };
    const prev = latest.get(group);
    // a pull request's checked decision stays its decision, so a new head never hides an answer already given
    if (!prev || (!prev.human && (item.human || item.ts > prev.ts))) latest.set(group, item);
  }
  return [...latest.values()].map((item) => { const { ts, ...rest } = item; void ts; return rest; });
}

/** TARGET items, half where D1A and the reviewer disagree and half where they agree; a stratum short of half is filled
 *  from the other. Checked items come first in their stratum, so answers never drop out as new decisions arrive. */
export function sample(items: Item[], target = TARGET): Item[] {
  const order = (xs: Item[]) => [...xs].sort((a, b) => Number(!!b.human) - Number(!!a.human) || rank(a.decision_id) - rank(b.decision_id));
  const dis = order(items.filter((i) => i.disagree)), agree = order(items.filter((i) => !i.disagree));
  const half = Math.ceil(target / 2);
  const nDis = Math.min(dis.length, Math.max(half, target - agree.length));
  const picked = [...dis.slice(0, nDis), ...agree.slice(0, target - nDis)];
  return picked.sort((a, b) => rank(a.decision_id) - rank(b.decision_id));   // strata interleaved, so the page does not reveal which is which
}

/** A posted answer checked against the sample: -> the body for /v1/feedback, or an error. "unsure" questions are left
 *  out, so the reviewer's label stands; src and group are set here, never by the browser. */
export function feedbackBody(items: Item[], posted: unknown):
    { ok: true; body: { decision_id: string; labels: Partial<Record<Question, string>>; src: "human"; group: string } } | { ok: false; error: string } {
  const p = posted as { decision_id?: unknown; labels?: unknown };
  const item = items.find((i) => i.decision_id === p?.decision_id);
  if (!item) return { ok: false, error: "not a decision in the review sample" };
  if (!p.labels || typeof p.labels !== "object" || Array.isArray(p.labels)) return { ok: false, error: "labels must be an object" };
  const labels: Partial<Record<Question, string>> = {};
  for (const [q, v] of Object.entries(p.labels as Record<string, unknown>)) {
    if (!(QUESTIONS as readonly string[]).includes(q)) return { ok: false, error: `unknown question ${q}` };
    if (v === UNSURE) continue;
    if (typeof v !== "string" || !item.options[q as Question].includes(v)) return { ok: false, error: `${q}: not one of its options` };
    labels[q as Question] = v;
  }
  return { ok: true, body: { decision_id: item.decision_id, labels, src: "human", group: item.group } };
}
