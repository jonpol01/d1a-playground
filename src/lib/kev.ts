// Modified from Kev (https://github.com/jaredpalmer/kev), Copyright 2026 Jared Palmer, Apache-2.0.
// Changes for the D1A playground by John Soliva, 2026.
// Types mirror the TypeSafe /v1/systemone contract that kev.serve implements.
import { recordRequest } from "@/lib/metrics";

export type JSONContent = string | number | boolean | null | JSONContent[] | { [k: string]: JSONContent };

export type Question =
  | { type: "noul"; instructions: JSONContent; criteria?: { true?: JSONContent; false?: JSONContent } }
  | { type: "choice"; instructions: JSONContent; criteria: Record<string, JSONContent> }
  | { type: "score"; instructions: JSONContent; criteria: JSONContent[] };

export type SystemOneRequest = { state: JSONContent; model: string; questions: Record<string, Question> };

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; legend: Record<string, string>; probabilities: Record<string, number> };

export type SystemOneResponse = {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
  latency_ms: number;
};

export type PermuteResponse = {
  runs: { order: string[]; probabilities: Record<string, number>; choice: string; latency_ms: number }[];
  argmax_stable: boolean;
  spread: Record<string, number>;
};

// The app can be served under a sub-path (D1A_BASE_PATH at build time); fetch URLs are not prefixed by Next itself.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const KEV = `${BASE_PATH}/kev`;
const MEDIA = `${BASE_PATH}/media`;   // d1a.media: the same questions about a photo or a voice clip (a separate server)

export type MediaRequest = Omit<SystemOneRequest, "state"> & { state?: JSONContent; media: { type: "image" | "audio"; data: string } };

async function post<T>(path: string, body: unknown, base = KEV): Promise<T> {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

export const api = {
  systemOne: async (req: SystemOneRequest) => {
    const t0 = performance.now();
    const r = await post<SystemOneResponse>("/v1/systemone", req);
    recordRequest({ at: Date.now(), latencyMs: r.latency_ms, rttMs: performance.now() - t0, questions: Object.keys(req.questions).length, tokens: r.usage.input_tokens });
    return r;
  },
  separate: (req: SystemOneRequest) => post<SystemOneResponse>("/v1/systemone/separate", req),
  permute: (request: SystemOneRequest, question: string, n_perm = 6) => post<PermuteResponse>("/v1/systemone/permute", { request, question, n_perm }),
  media: async (req: MediaRequest) => {
    const t0 = performance.now();
    const r = await post<SystemOneResponse>("/v1/systemone/media", req, MEDIA);
    recordRequest({ at: Date.now(), latencyMs: r.latency_ms, rttMs: performance.now() - t0, questions: Object.keys(req.questions).length, tokens: r.usage.input_tokens });
    return r;
  },
  models: async () => {
    const r = await fetch(`${KEV}/v1/models`);
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    return r.json() as Promise<{ models: { name: string; run: string; base: string; device?: string; backend?: string; dtype?: string }[] }>;
  },
};

export const MODEL = "kev-latest";

export const MEDIA_START_HINT = {
  en: "Photo check and Voice triage use a second model server, d1a.media. In a d1a checkout run: uv run --extra serve --extra media python -m d1a.media --port 8010 (about 10 GB of memory; the first start downloads Gemma 4 with its vision and audio encoders).",
  ja: "写真チェックと音声トリアージは、2つ目のモデルサーバー d1a.media を使います。d1a のチェックアウトで uv run --extra serve --extra media python -m d1a.media --port 8010 を実行してください（メモリ約 10 GB。初回は画像・音声エンコーダー付きの Gemma 4 をダウンロードします）。",
};

export const START_HINT = {
  en: "Start it with ./demo.sh (Windows: .\\demo.ps1). The first start downloads the model and can take several minutes.",
  ja: "./demo.sh（Windows では .\\demo.ps1）で起動してください。初回はモデルのダウンロードがあるため、数分かかることがあります。",
};

// A proxy failure (server not started, still loading, or crashed) reaches the browser as a 5xx without a JSON
// body, or as a network error; kev.serve's own validation errors carry {"detail": ...} and are shown as they are.
export function describeError(e: unknown, lang: "en" | "ja" = "en"): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /^(\d{3}): ([\s\S]*)$/.exec(msg);
  const status = m ? Number(m[1]) : 0;
  const body = m ? m[2] : "";
  if (e instanceof TypeError || (status >= 500 && !body.trimStart().startsWith("{")) || status === 404) {
    const what = m ? `HTTP ${status}` : msg;
    return lang === "ja"
      ? `モデルサーバーが応答していません（${what}）。${START_HINT.ja}`
      : `The model server is not answering (${what}). ${START_HINT.en}`;
  }
  return msg;
}
