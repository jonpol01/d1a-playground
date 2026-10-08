// Every demo's built-in examples as the requests the UI sends, for scripts/demo_smoke.mjs. Built from the demos' own
// questions, presets and state builders (exported from their modules), so the smoke test cannot drift from the UI.
import { MODEL, type Question } from "@/lib/kev";
import type { Lang } from "@/lib/i18n";
import { BULK_TEXT, INBOX_TEXT, LABEL_Q, RERANK_TEXT, splitBlocks, splitLines, splitPassages, TRIAGE_Q } from "@/components/uses/batch";
import { describe, MOVE_Q } from "@/components/uses/control";
import { CLIPS, PHOTO_Q, PHOTOS, VIDEOS, VOICE_Q } from "@/components/uses/media";
import { PR_Q, PRESETS, prState } from "@/components/uses/prlabel";
import { EVAL_Q, EVAL_TEXT, evalState, GATE_TEXT, GUARD_Q, GUARD_TEXT, parseOptions, ROUTE_Q, ROUTE_TEXT, ROUTE_USE_CASE, TOOL_Q, TOOL_TEXT, toolState } from "@/components/uses/single";

export type SmokeRequest =
  | { demo: string; name: string; kind: "text"; body: { state: string; model: string; questions: Record<string, Question>; use_case?: string } }
  | { demo: string; name: string; kind: "media"; file: string; mediaType: "image" | "audio" | "video"; questions: Record<string, Question> };

const text = (demo: string, name: string, state: string, questions: Record<string, Question>, useCase?: string): SmokeRequest =>
  ({ demo, name, kind: "text", body: { state, model: MODEL, questions, ...(useCase ? { use_case: useCase } : {}) } });

export function smokeRequests(langs: Lang[] = ["en", "ja"]): SmokeRequest[] {
  const out: SmokeRequest[] = [];
  for (const lang of langs) {
    const route = ROUTE_TEXT[lang], guard = GUARD_TEXT[lang], tool = TOOL_TEXT[lang], ev = EVAL_TEXT[lang], gate = GATE_TEXT[lang];
    route.presets.forEach((p) => out.push(text("routing", `${lang}: ${p.name}`, p.prompt, ROUTE_Q, ROUTE_USE_CASE)));
    guard.presets.forEach((p) => out.push(text("guardrails", `${lang}: ${p.name}`, p.text, GUARD_Q)));
    tool.presets.forEach((p) => out.push(text("tool-gate", `${lang}: ${p.name}`, toolState(p.task, p.tool, p.args), TOOL_Q)));
    ev.presets.forEach((p) => out.push(text("evals", `${lang}: ${p.name}`, evalState(ev.question, ev.reference, p.answer), EVAL_Q(true))));
    out.push(text("evals", `${lang}: no reference`, evalState(ev.question, "", ev.presets[0].answer), EVAL_Q(false)));
    gate.presets.forEach((p) => out.push(text("gate", `${lang}: ${p.name}`, p.text, { action: { type: "choice", instructions: gate.instructions, criteria: parseOptions(gate.options) } })));
    splitBlocks(INBOX_TEXT[lang].emails).forEach((e, i) => out.push(text("inbox", `${lang}: email ${i + 1}`, e, TRIAGE_Q)));
    const rr = RERANK_TEXT[lang];
    splitPassages(rr.passages).forEach((p, i) => out.push(text("rerank", `${lang}: passage ${i + 1}`, p, { answers: { type: "noul", instructions: rr.ask(rr.query) } })));
    splitLines(BULK_TEXT[lang].reviews).forEach((r, i) => out.push(text("bulk", `${lang}: row ${i + 1}`, r, LABEL_Q)));
  }
  PRESETS.forEach((p) => out.push(text("pr-labeler", p.name, prState(p.pr), PR_Q)));
  // Control runs live with a moving target; fixed positions cover its three cases: left, right, on target, with and without the hint.
  for (const [robot, target, hint] of [[3, 10, true], [12, 4, true], [7, 7, true], [3, 10, false]] as const)
    out.push(text("control", `robot ${robot}, target ${target}${hint ? "" : ", no hint"}`, describe(robot, target, hint), MOVE_Q));
  PHOTOS.forEach((n) => out.push({ demo: "photo", name: n, kind: "media", file: `${n}.jpg`, mediaType: "image", questions: PHOTO_Q }));
  CLIPS.forEach((n) => out.push({ demo: "voice", name: n, kind: "media", file: `voice_${n}.wav`, mediaType: "audio", questions: VOICE_Q }));
  VIDEOS.forEach((n) => out.push({ demo: "video", name: n, kind: "media", file: `video_${n}.mp4`, mediaType: "video", questions: PHOTO_Q }));
  const seen = new Set<string>();   // the same request in both languages (e.g. a preset not translated) runs once
  return out.filter((r) => { const k = JSON.stringify(r.kind === "text" ? r.body : [r.file, r.questions]); return seen.has(k) ? false : (seen.add(k), true); });
}
