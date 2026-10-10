import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseShow, summarize } from "@/lib/learning";

// The Learning page (d1a#233). GET: the self-learning settings in force (through d1a's own `config show`, so this page
// never disagrees with the jobs), their recent changes, and the tick's status. POST {set: {key: value}}: one change,
// through `config set --source page`, which validates the whole file first and writes nothing when a value is out of
// range. Off (404) unless mini.sh passes LEARNING_FILE. Decision logging is not a setting here: /review and the outcome
// poster read that log, so it stays an environment setting of the model server (D1A_FEEDBACK_LOG).
export const dynamic = "force-dynamic";

const FILE = process.env.LEARNING_FILE ?? "";
const STATUS = process.env.LEARNING_STATUS ?? "";
const PY = process.env.LEARNING_PY ?? "python3";
const LOGGING = Boolean(process.env.REVIEW_FEEDBACK_LOG);

function config(args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(PY, ["-m", "d1a.learning.feedback", "config", ...args, "--file", FILE], { timeout: 30_000 }, (e, out, err) =>
      resolve({ ok: !e, out: String(out), err: String(err) || (e ? e.message : "") }));
  });
}

async function readJson(path: string) {
  try { return JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")); } catch { return null; }
}

async function audit() {
  try {
    const text = await readFile(/* turbopackIgnore: true */ `${FILE}.audit.jsonl`, "utf8");
    return text.split("\n").filter(Boolean).slice(-20).reverse().map((l) => JSON.parse(l));
  } catch { return []; }
}

const off = () => Response.json({ error: "the Learning page is off: mini.sh passes LEARNING_FILE when LABEL_OUTCOMES=1 and OUTCOME_CALIBRATOR are set" }, { status: 404 });

export async function GET() {
  if (!FILE) return off();
  const [shown, status, changes] = await Promise.all([config(["show"]), STATUS ? readJson(STATUS) : null, audit()]);
  if (!shown.ok) return Response.json({ error: `config show: ${shown.err}` }, { status: 500 });
  const reports = (status?.reports ?? []).slice(-15).reverse().map(summarize);
  return Response.json({
    ...parseShow(shown.out), changes, logging: LOGGING,
    status: status && { run: status.run, last_gate: status.last_gate, per_question: status.per_question ?? {}, replay_complete: status.replay_complete, reports },
  });
}

export async function POST(req: Request) {
  if (!FILE) return off();
  let body: { set?: Record<string, unknown> };
  try { body = await req.json(); } catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  const pairs = Object.entries(body.set ?? {});
  if (!pairs.length || pairs.some(([k]) => !/^[a-z_]+\.[a-z_]+$/.test(k))) return Response.json({ error: "set: {\"section.key\": value, ...}" }, { status: 400 });
  const r = await config(["set", ...pairs.map(([k, v]) => `${k}=${JSON.stringify(v)}`), "--source", "page"]);
  if (!r.ok) return Response.json({ error: r.err.replace(/^refused: /, "").trim() }, { status: 400 });
  return Response.json({ ok: true, changed: r.out.trim().split("\n").filter(Boolean) });
}
