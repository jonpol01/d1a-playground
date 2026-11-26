// The routing demo's "Send it" (POST /api/route-chat): one prompt sent through the model server's chat routes (d1a
// D1A_ROUTES), answered by D1A or forwarded to the large model it routes to. Anyone who opens the playground can use it, and a
// forwarded chat spends a large model shared with other work, so everything about the call is fixed here: one user message,
// no tools, no system prompt, no history, a size cap, and limits per client and for everyone together.

export const PROMPT_MAX = 2000;        // characters, after trimming
export const MAX_TOKENS = 512;         // the answer's cap, D1A's or the large model's
export const TIMEOUT_MS = 100_000;     // under the serving host's port-80 proxy cut (130 s)
export const PER_CLIENT = { n: 5, ms: 10 * 60_000 };
export const GLOBAL = { n: 30, ms: 60 * 60_000 };
export const IN_FLIGHT = 1;

// A pull-request link, an issue or PR number, or a fenced block can send a chat to the review route (d1a routes.review_request),
// which reads a repository's pull request: this demo never sends one, so the reviewer and private review text stay out of reach.
export const REVIEW_TRAP = /```|~~~|\/pull\/|#[0-9]/i;

export type Checked = { ok: true; prompt: string } | { ok: false; status: number; error: string };

/** The body must be exactly {"prompt": "<text>"}: any other field (messages, tools, model, max_tokens, stream) is refused. */
export function checkBody(posted: unknown): Checked {
  if (!posted || typeof posted !== "object" || Array.isArray(posted)) return { ok: false, status: 400, error: 'send {"prompt": "<text>"}' };
  const keys = Object.keys(posted);
  if (keys.length !== 1 || keys[0] !== "prompt") return { ok: false, status: 400, error: 'send only {"prompt": "<text>"}: no tools, messages or other fields' };
  const raw = (posted as { prompt: unknown }).prompt;
  if (typeof raw !== "string") return { ok: false, status: 400, error: "prompt must be text" };
  const prompt = raw.trim();
  if (!prompt) return { ok: false, status: 400, error: "the prompt is empty" };
  if ([...prompt].length > PROMPT_MAX) return { ok: false, status: 413, error: `the prompt is longer than ${PROMPT_MAX} characters` };
  if (REVIEW_TRAP.test(prompt)) return { ok: false, status: 400, error: "this demo does not send pull-request links, #numbers or code blocks" };
  return { ok: true, prompt };
}

/** Who is asking. Only behind a proxy the app trusts (TRUST_FORWARDED_FOR=1: the app listens on 127.0.0.1 and a proxy in front
 * appends the address it saw after any the client wrote) is that last x-forwarded-for hop the client; otherwise the header is
 * the client's own word, so every caller shares one key and the per-client limit holds for everyone together. */
export function clientKey(req: Request, trustForwarded = false): string {
  if (!trustForwarded) return "everyone";
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops.at(-1) ?? "unknown";
}

export type Taken = { ok: true; release: () => void } | { ok: false; retryAfterS: number; why: "client" | "everyone" | "busy" };

/** Sliding-window limits in this process's memory: PER_CLIENT for one client, GLOBAL for everyone, IN_FLIGHT at once. */
export class Limiter {
  private seen = new Map<string, number[]>();
  private all: number[] = [];
  private flying = 0;
  private now: () => number;
  private limits: { client: typeof PER_CLIENT; global: typeof GLOBAL; inFlight: number };
  constructor(now: () => number = Date.now, limits = { client: PER_CLIENT, global: GLOBAL, inFlight: IN_FLIGHT }) {
    this.now = now; this.limits = limits;
  }
  take(client: string): Taken {
    const t = this.now();
    const mine = (this.seen.get(client) ?? []).filter((x) => t - x < this.limits.client.ms);
    this.all = this.all.filter((x) => t - x < this.limits.global.ms);
    if (this.flying >= this.limits.inFlight) return { ok: false, retryAfterS: 15, why: "busy" };
    if (mine.length >= this.limits.client.n) return { ok: false, retryAfterS: Math.ceil((mine[0] + this.limits.client.ms - t) / 1000), why: "client" };
    if (this.all.length >= this.limits.global.n) return { ok: false, retryAfterS: Math.ceil((this.all[0] + this.limits.global.ms - t) / 1000), why: "everyone" };
    mine.push(t); this.seen.set(client, mine); this.all.push(t); this.flying++;
    let done = false;
    return { ok: true, release: () => { if (!done) { done = true; this.flying--; } } };
  }
}

export type Large = { name: string; model: string } | null;

/** The card's large route ({name, model}), or null when the model server routes nothing to a large model. */
export function largeRoute(card: unknown): Large {
  const routes = (card as { routes?: unknown })?.routes;
  if (!Array.isArray(routes)) return null;
  const r = routes.find((x) => x && typeof x === "object" && (x as { kind?: unknown }).kind === "openai") as { name?: unknown; model?: unknown } | undefined;
  return r && typeof r.name === "string" && typeof r.model === "string" ? { name: r.name, model: r.model } : null;
}

export type Shown = { who: "d1a" | "large" | "none"; answer: string; note?: "fallback" | "no-answer" | "not-shown" };

/** What the page may say about a reply. "large" only when the large route answered cleanly: its route name, no route error,
 * the large model's own name in the reply and a non-empty answer. A fallback (the large model busy or down, D1A answered) says
 * so; any other route's text is never shown. */
export function shown(route: string | null, routeError: string | null, model: unknown, answer: unknown, large: Large): Shown {
  const text = typeof answer === "string" ? answer.trim() : "";
  if (large && route === large.name) {
    if (routeError) return text ? { who: "d1a", answer: text, note: "fallback" } : { who: "none", answer: "", note: "no-answer" };
    if (model === large.model && text) return { who: "large", answer: text };
    return { who: "none", answer: "", note: "no-answer" };
  }
  if (route === "none") return text ? { who: "d1a", answer: text } : { who: "none", answer: "", note: "no-answer" };
  return { who: "none", answer: "", note: "not-shown" };
}

export type Deps = {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  limiter: Limiter;
  readKey: (path: string) => Promise<string>;
  now?: () => number;
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers });

export const chatApi = (env: Deps["env"]) => (env.CHAT_API ?? env.MODEL_API ?? env.KEV_API ?? "http://127.0.0.1:8009").replace(/\/+$/, "");

async function headers(deps: Deps): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (deps.env.CHAT_KEY_FILE) h.Authorization = `Bearer ${(await deps.readKey(deps.env.CHAT_KEY_FILE)).trim()}`;
  return h;
}

/** The model server's card, for its large route; null when it cannot be read. */
export async function card(deps: Deps): Promise<unknown> {
  try {
    const r = await deps.fetch(`${chatApi(deps.env)}/v1/models`, { headers: await headers(deps), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    return (await r.json() as { models?: unknown[] }).models?.[0] ?? null;
  } catch { return null; }
}

/** GET: whether "Send it" is offered: the demo is on (ROUTE_DEMO=1) and the model server has a large route. */
export async function status(deps: Deps): Promise<Response> {
  if (deps.env.ROUTE_DEMO !== "1") return json({ on: false });
  const large = largeRoute(await card(deps));
  return json({ on: Boolean(large), large: large?.model ?? null, limits: { prompt: PROMPT_MAX, perClient: PER_CLIENT, everyone: GLOBAL } });
}

/** POST, after the cross-site check: validate, take a slot, one chat through the routes, and what the page may show. */
export async function send(req: Request, deps: Deps): Promise<Response> {
  if (deps.env.ROUTE_DEMO !== "1") return json({ error: "the routing demo is off on this playground" }, 404);
  let posted: unknown;
  try { posted = await req.json(); } catch { return json({ error: "body must be JSON" }, 400); }
  const checked = checkBody(posted);
  if (!checked.ok) return json({ error: checked.error }, checked.status);
  const large = largeRoute(await card(deps));
  if (!large) return json({ error: "the model server routes no chat to a large model" }, 503);
  const slot = deps.limiter.take(clientKey(req, deps.env.TRUST_FORWARDED_FOR === "1"));
  if (!slot.ok) return json({ error: slot.why, retryAfterS: slot.retryAfterS }, 429, { "retry-after": String(slot.retryAfterS) });
  const now = deps.now ?? Date.now, t = now();
  try {
    const r = await deps.fetch(`${chatApi(deps.env)}/v1/chat/completions`, {
      method: "POST", headers: await headers(deps), signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({ model: "d1a-chat", messages: [{ role: "user", content: checked.prompt }], max_tokens: MAX_TOKENS }),
    });
    const route = r.headers.get("x-d1a-route"), routeError = r.headers.get("x-d1a-route-error");
    const body = await r.json().catch(() => null) as { model?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
    if (!r.ok) return json({ error: `model server: HTTP ${r.status}`, route }, 502);
    const s = shown(route, routeError, body?.model, body?.choices?.[0]?.message?.content, large);
    return json({ ...s, route, routeError, model: typeof body?.model === "string" ? body.model : null, large: large.model, ms: now() - t });
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError";
    return json({ error: timedOut ? `no answer within ${TIMEOUT_MS / 1000} s` : "the model server cannot be reached" }, 504);
  } finally {
    slot.release();
  }
}
