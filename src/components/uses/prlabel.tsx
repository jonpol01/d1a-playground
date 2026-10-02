"use client";

import { useState } from "react";
import type { Question } from "@/lib/kev";
import { useText } from "@/lib/i18n";
import { AnswerBars, DemoGrid, Empty, ErrorNote, Field, inputCls, Latency, Presets, ResultCard, RunBar, textareaCls, Verdict } from "@/components/uses/shared";
import { useKevRequest } from "@/components/uses/use-request";
import { Shimmer } from "@/components/uses/visuals";

// PR labeler: the labeling a scheduled job runs on every open pull request (the CTO bot's personal-pr-label cron). The
// document and the three questions are built exactly as that job builds them, so this page answers what production
// answers; the rules it applies on top (a low-confidence flag, committed secrets) are the job's too.

const TYPES = ["type/bug", "type/docs", "type/feature", "type/perf", "type/refactor", "type/security", "type/test"];
const PR_Q: Record<string, Question> = {
  type: {
    type: "choice", instructions: "Primary change type from files and body, not the title prefix.",
    criteria: {
      "type/bug": "Defect / incorrect behavior", "type/docs": "Documentation only", "type/feature": "New behavior",
      "type/perf": "Performance", "type/refactor": "No intended behavior change", "type/security": "Auth, secrets, or permissions",
      "type/test": "Tests or CI",
    },
  },
  blast: {
    type: "choice", instructions: "How far a mistake in this PR spreads in production.",
    criteria: {
      "review:blast-contained": "One module", "review:blast-moderate": "One subsystem",
      "review:blast-broad": "Shared helper or config", "review:blast-massive": "Auth, permissions, or all paths",
    },
  },
  sev: {
    type: "choice",
    instructions: "How serious the problem this PR addresses is — not the risk of merging the diff as-is. P0 = the bug/outage being fixed is drop-everything (data loss, a security hole being closed, crash loop). P1 = major break, no workaround. P2 = degraded, workaround exists. P3 = cosmetic / nice-to-have. P4 = best-effort. Dependabot lockfile bumps without CVE are P4. Docs-only is P4. CI/test infra that can block main is P2.",
    criteria: {
      P0: "Drop everything — data loss, security, crash loop", P1: "Major break, no workaround", P2: "Degraded, workaround exists",
      P3: "Cosmetic or nice-to-have", P4: "Best-effort, no promise",
    },
  },
};
const BLAST_SHORT: Record<string, string> = Object.fromEntries(Object.keys(PR_Q.blast.type === "choice" ? PR_Q.blast.criteria : {}).map((k) => [k, k.replace("review:blast-", "")]));
const CONFIDENT = 0.7;   // the job adds review:needs-human below this on any of the three answers
const SECRET = /(^|\/)\.env(\.[^/]*)?$/;   // a committed .env (not .env.example and the like) forces security and at least P1
const isSecret = (path: string) => SECRET.test(path) && !/example|sample|template|dist/i.test(path);

type PR = { title: string; author: string; body: string; files: string };   // files: one "status path +a/-d" per line

/** The job's document: title, author, stats, body (HTML stripped, 3,500 characters), up to 40 files. */
function prState(pr: PR) {
  const files = pr.files.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 40);
  let add = 0, del = 0;
  for (const f of files) { const m = /\+(\d+)\/-(\d+)\s*$/.exec(f); if (m) { add += +m[1]; del += +m[2]; } }
  const body = pr.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3500);
  return [`title: ${pr.title.slice(0, 240)}`, `author: ${pr.author}`, `stats: +${add}/-${del} files=${files.length}`, "body:", body || "(empty)", "files:",
    ...(files.length ? files.map((f) => `- ${f}`) : ["- (none listed)"])].join("\n");
}

/** A public pull request from GitHub's API (no token: public repositories, 60 requests an hour per address). */
async function fetchPR(url: string): Promise<PR> {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  if (!m) throw new Error("Expected a link like https://github.com/owner/repo/pull/123");
  const api = `https://api.github.com/repos/${m[1]}/${m[2]}/pulls/${m[3]}`;
  const [pr, files] = await Promise.all([fetch(api), fetch(`${api}/files?per_page=40`)].map((p) => p.then(async (r) => {
    if (!r.ok) throw new Error(`GitHub: ${r.status} ${r.status === 404 ? "(private or missing)" : r.status === 403 ? "(rate limit)" : ""}`);
    return r.json();
  })));
  return {
    title: pr.title ?? "", author: pr.user?.login ?? "", body: pr.body ?? "",
    files: (files as { status: string; filename: string; additions: number; deletions: number }[]).map((f) => `${f.status} ${f.filename} +${f.additions}/-${f.deletions}`).join("\n"),
  };
}

const PRESETS: { name: string; pr: PR }[] = [
  { name: "Dependency security fix", pr: { title: "Bump next from 16.3.5 to 16.3.6 in /playground", author: "dependabot[bot]",
    body: "Bumps next from 16.3.5 to 16.3.6. This release contains a security fix for GHSA-vcvr-r3jv-pc5j: Remote Code Execution in next/og ImageResponse.",
    files: "modified playground/package-lock.json +106/-40\nmodified playground/package.json +1/-1" } },
  { name: "Docs only", pr: { title: "Report: Apple Core AI and Foundation Models (macOS/iOS 27) vs D1A", author: "jonpol01",
    body: "Assessment for #75: Foundation Models gives no token probabilities, so it is a routing target, not a backend. Core AI could host D1A on iPhone later.",
    files: "added docs/reports/2026-10-apple-core-ai.md +118/-0" } },
  { name: "New feature", pr: { title: "d1a.media: load on demand, unload when idle", author: "jonpol01",
    body: "The media server starts empty, loads the model on the first photo or voice request, and drops it after --idle-unload seconds idle. A request in flight always keeps its model.",
    files: "modified d1a/media.py +62/-12\nmodified tests/test_unit.py +18/-0\nmodified README.md +1/-1" } },
  { name: "CI change", pr: { title: "CI and releases: test matrix, Apple Silicon, lint, package check", author: "jonpol01",
    body: "CI runs the unit tests on Python 3.12 and 3.13 and on Apple Silicon, a lint pass and a package check. Pushing a vX.Y.Z tag publishes a release.",
    files: "modified .github/workflows/ci.yml +63/-3\nadded .github/workflows/release.yml +28/-0\nadded scripts/release_notes.py +49/-0\nadded CHANGELOG.md +116/-0" } },
  { name: "Commits a .env", pr: { title: "Add integration tests", author: "dev-team-bot",
    body: "Automated by the dev team orchestrator: run tests.",
    files: "added .env +28/-0\nadded .github/workflows/test.yml +38/-0\nadded src/lib.rs +204/-0\nadded tests/integration_test.rs +91/-0" } },
];

const TEXT = {
  en: {
    names: PRESETS.map((p) => p.name), url: "Or load a public GitHub PR", load: "Load", loading: "Loading…",
    title: "Title", author: "Author", body: "Description", files: "Files", filesHint: "one per line: status path +added/-deleted",
    run: "Label this PR", busy: "Labeling…", empty: "Pick an example, paste a PR or load one from GitHub: D1A answers the labeler's three questions in one pass.",
    needsHuman: "needs a human", confident: "confident", flagNote: (q: string) => `An answer below p ${CONFIDENT} (${q}) adds review:needs-human, as the labeling job does.`,
    rule: "Rule: a committed .env forces type/security and at least P1 (D1A's own answers are kept below).",
    labels: "Labels the job would apply", qType: "Change type", qBlast: "Blast radius", qSev: "Severity",
    note: "The same document and questions as the CTO bot's labeling job, which asks D1A on the Mac mini every few minutes. On 17 real PRs it got 63% of labels right vs 51% for Gemma 4 chat of the same size.",
  },
  ja: {
    names: ["依存関係のセキュリティ修正", "ドキュメントのみ", "新機能", "CI の変更", ".env をコミット"], url: "または公開リポジトリの PR を GitHub から読み込む", load: "読み込む", loading: "読み込み中…",
    title: "タイトル", author: "作成者", body: "説明", files: "ファイル", filesHint: "1行に1つ: 状態 パス +追加/-削除",
    run: "この PR にラベル付け", busy: "判定中…", empty: "例を選ぶか、PR を貼り付けるか、GitHub から読み込んでください。D1A がラベル付けジョブの3つの質問に1回で答えます。",
    needsHuman: "人が確認", confident: "確信あり", flagNote: (q: string) => `p ${CONFIDENT} 未満の答え（${q}）があるので、ラベル付けジョブと同じく review:needs-human を付けます。`,
    rule: "ルール: .env のコミットは type/security と P1 以上に強制します（D1A 自身の答えは下に表示）。",
    labels: "ジョブが付けるラベル", qType: "変更の種類", qBlast: "影響範囲", qSev: "深刻度",
    note: "CTO ボットのラベル付けジョブと同じ文書・同じ質問です。ジョブは数分ごとに Mac mini の D1A に問い合わせます。実際の 17 件の PR では、正しいラベルの割合が D1A 63%、同じサイズの Gemma 4 チャットは 51% でした。",
  },
};

export function PRLabelDemo() {
  const t = useText(TEXT);
  const [pi, setPi] = useState(0);
  const [pr, setPR] = useState<PR>(PRESETS[0].pr);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const req = useKevRequest();
  const set = (k: keyof PR) => (e: { target: { value: string } }) => setPR({ ...pr, [k]: e.target.value });

  async function load() {
    setLoading(true); req.reset();
    try { setPR(await fetchPR(url.trim())); setPi(-1); } catch (e) { req.fail(e); } finally { setLoading(false); }
  }

  const a = req.result?.answers;
  const top = (q: string) => (a?.[q]?.type === "choice" ? a[q] : null);
  const unsure = ["type", "blast", "sev"].filter((q) => { const x = top(q); return x?.type === "choice" && Math.max(...Object.values(x.probabilities)) < CONFIDENT; });
  const secret = pr.files.split("\n").some((l) => isSecret(l.trim().split(/\s+/)[1] ?? ""));
  const sevRank = (s: string) => ["P0", "P1", "P2", "P3", "P4"].indexOf(s);
  const labels = a ? [
    secret ? "type/security" : top("type")?.choice,
    top("blast")?.choice,
    secret && sevRank(top("sev")?.choice ?? "P4") > 1 ? "P1" : top("sev")?.choice,
    ...(unsure.length ? ["review:needs-human"] : []),
  ].filter((x): x is string => !!x && (TYPES.includes(x) || x.startsWith("review:") || /^P[0-4]$/.test(x))) : [];
  const qName = { type: t.qType, blast: t.qBlast, sev: t.qSev } as Record<string, string>;

  return (
    <DemoGrid
      left={<>
        <Presets presets={t.names.map((name) => ({ name }))} current={pi} onPick={(i) => { setPi(i); setPR(PRESETS[i].pr); req.reset(); }} />
        <Field label={t.url} htmlFor="pr-url">
          <div className="flex gap-2">
            <input id="pr-url" className={inputCls} placeholder="https://github.com/owner/repo/pull/123" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button type="button" onClick={load} disabled={!url.trim() || loading} className="h-8 shrink-0 rounded-md border border-border px-3 text-[13px] hover:border-(--demo-line) disabled:opacity-50">{loading ? t.loading : t.load}</button>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label={t.title} htmlFor="pr-title"><input id="pr-title" className={inputCls} value={pr.title} onChange={set("title")} /></Field>
          <Field label={t.author} htmlFor="pr-author"><input id="pr-author" className={inputCls} value={pr.author} onChange={set("author")} /></Field>
        </div>
        <Field label={t.body} htmlFor="pr-body"><textarea id="pr-body" className={`${textareaCls} min-h-24`} value={pr.body} onChange={set("body")} /></Field>
        <Field label={t.files} hint={t.filesHint} htmlFor="pr-files"><textarea id="pr-files" className={`${textareaCls} min-h-24`} value={pr.files} onChange={set("files")} /></Field>
        <RunBar onRun={() => req.run(prState(pr), PR_Q)} busy={req.busy} disabled={!pr.title.trim()} label={t.run} busyLabel={t.busy} />
        <ErrorNote error={req.error} />
      </>}
      right={req.result && a ? <>
        <Verdict label={unsure.length ? t.needsHuman.toUpperCase() : t.confident.toUpperCase()} tone={unsure.length ? "wait" : "go"}>
          {unsure.length ? t.flagNote(unsure.map((q) => qName[q]).join(", ")) : null}
        </Verdict>
        <ResultCard title={<>{t.labels} · <Latency r={req.result} /></>}>
          <div className="flex flex-wrap gap-2">
            {labels.map((l) => <span key={l} className={`rounded-full border px-2.5 py-0.5 font-mono text-[12px] ${l === "review:needs-human" ? "border-amber-500/60 bg-amber-500/10" : "border-(--demo-line) bg-(--demo-soft)"}`}>{l}</span>)}
          </div>
          {secret && <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{t.rule}</p>}
        </ResultCard>
        {(["type", "blast", "sev"] as const).map((q) => a[q] && <ResultCard key={q} title={qName[q]}><AnswerBars answer={a[q]} labels={q === "blast" ? BLAST_SHORT : undefined} /></ResultCard>)}
        <p className="text-[12px] leading-5 text-muted-foreground">{t.note}</p>
      </> : req.busy ? <Shimmer tall /> : <Empty>{t.empty}</Empty>}
    />
  );
}
