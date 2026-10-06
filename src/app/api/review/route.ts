import { readFile } from "node:fs/promises";
import { candidates, feedbackBody, parseJsonl, sample, TARGET } from "@/lib/review";

// The human check of the PR labeler's labels (d1a-playground#29). GET: the sample, read from the model server's decision
// log on this machine (only the fields the page shows leave it). POST {decision_id, labels}: one checked decision,
// forwarded to the model server's POST /v1/feedback as src=human. Off (404) unless mini.sh passes REVIEW_FEEDBACK_LOG.
export const dynamic = "force-dynamic";

const KEV_API = process.env.KEV_API ?? "http://127.0.0.1:8009";
const LOG = process.env.REVIEW_FEEDBACK_LOG ?? "";                                       // the model server's D1A_FEEDBACK_LOG
const CALLS = process.env.REVIEW_LABELER_LOG ?? "/Users/Shared/d1a/labeler-decisions.jsonl";  // names the PR of outcomes without a group

async function current() {
  // files of this machine named at run time, not part of the app: the comments keep the build from tracing the whole project
  const [log, calls] = await Promise.all([readFile(/* turbopackIgnore: true */ LOG, "utf8"),
                                          readFile(/* turbopackIgnore: true */ CALLS, "utf8").catch(() => "")]);
  const pool = candidates(parseJsonl(log), parseJsonl(calls));
  return { pool, items: sample(pool) };
}

const off = () => Response.json({ error: "the review is off: start the web app with REVIEW_FEEDBACK_LOG (mini.sh: LABEL_OUTCOMES=1)" }, { status: 404 });

export async function GET() {
  if (!LOG) return off();
  try {
    const { pool, items } = await current();
    return Response.json({
      target: TARGET, done: items.filter((i) => i.human).length, items,
      pool: { resolved: pool.length, disagree: pool.filter((i) => i.disagree).length },
    });
  } catch (e) {
    return Response.json({ error: `cannot read the decision log: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!LOG) return off();
  let posted: unknown;
  try { posted = await req.json(); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  const checked = feedbackBody((await current()).items, posted);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
  const r = await fetch(`${KEV_API}/v1/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checked.body) })
    .catch((e: Error) => ({ ok: false, status: 502, text: async () => e.message }));
  if (!r.ok) return Response.json({ error: `model server: ${await r.text()}` }, { status: 502 });
  return Response.json({ ok: true, posted: checked.body.labels });
}
