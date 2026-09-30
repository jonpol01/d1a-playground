// Modified from Kev (https://github.com/jaredpalmer/kev), Copyright 2026 Jared Palmer, Apache-2.0.
// Changes for the D1A playground by John Soliva, 2026.
// Types mirror the TypeSafe /v1/systemone contract that kev.serve implements.
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

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`/kev${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

export const api = {
  systemOne: (req: SystemOneRequest) => post<SystemOneResponse>("/v1/systemone", req),
  separate: (req: SystemOneRequest) => post<SystemOneResponse>("/v1/systemone/separate", req),
  permute: (request: SystemOneRequest, question: string, n_perm = 6) => post<PermuteResponse>("/v1/systemone/permute", { request, question, n_perm }),
  models: async () => {
    const r = await fetch("/kev/v1/models");
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
    return r.json() as Promise<{ models: { name: string; run: string; base: string }[] }>;
  },
};

export const MODEL = "kev-latest";

export const START_HINT = "Start it with ./demo.sh (Windows: .\\demo.ps1). The first start downloads the model and can take several minutes.";

// A proxy failure (server not started, still loading, or crashed) reaches the browser as a 5xx without a JSON
// body, or as a network error; kev.serve's own validation errors carry {"detail": ...} and are shown as they are.
export function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /^(\d{3}): ([\s\S]*)$/.exec(msg);
  const status = m ? Number(m[1]) : 0;
  const body = m ? m[2] : "";
  if (e instanceof TypeError || (status >= 500 && !body.trimStart().startsWith("{")) || status === 404) {
    return `The model server is not answering (${m ? `HTTP ${status}` : msg}). ${START_HINT}`;
  }
  return msg;
}
