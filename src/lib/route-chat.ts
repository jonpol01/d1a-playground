// The routing demo's Ask (POST /api/route-chat): one chat call through the model server's chat routes (d1a D1A_ROUTES),
// the same call an app makes: D1A answers it itself or forwards it to the large model it routes to, in the same reply. Anyone
// who opens the playground can use it, and a forwarded chat spends a large model shared with other work, so everything about
// the call is fixed here: one user message, no tools, no system prompt, no history, a size cap, and limits per client and for
// everyone together.

export const PROMPT_MAX = 2000;        // characters, after trimming
export const MAX_TOKENS = 512;         // the answer's cap, D1A's or the large model's
export const TIMEOUT_MS = 100_000;     // under the serving host's port-80 proxy cut (130 s)
// Two buckets. The tight one counts the sends that reach past D1A: a send D1A answered itself, with no fallback, is given
// back, so easy prompts do not use it up. The outer one counts every send and is never given back.
export const PER_CLIENT = { n: 5, ms: 10 * 60_000 };
export const GLOBAL = { n: 30, ms: 60 * 60_000 };
export const ALL_PER_CLIENT = { n: 20, ms: 10 * 60_000 };
export const ALL_GLOBAL = { n: 120, ms: 60 * 60_000 };
export const IN_FLIGHT = 3;           // chats at once for everyone; the model server waits for a free large-model slot

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

export type Window = { n: number; ms: number };
export type Limits = { client: Window; global: Window; allClient: Window; allGlobal: Window; inFlight: number };
export type Why = "client" | "everyone" | "client-all" | "everyone-all" | "busy";
export type Taken = { ok: true; release: () => void; refund: () => void } | { ok: false; retryAfterS: number; why: Why };

/** Sliding-window limits in this process's memory: the tight bucket (PER_CLIENT, GLOBAL), the outer bucket for every send
 * (ALL_PER_CLIENT, ALL_GLOBAL), and IN_FLIGHT at once. Without a trusted proxy every caller is one client (clientKey), so the
 * per-client windows then hold for everyone together. refund() gives back the tight bucket's entries only. */
export class Limiter {
  private tight = new Map<string, number[]>();
  private tightAll: number[] = [];
  private outer = new Map<string, number[]>();
  private outerAll: number[] = [];
  private flying = 0;
  private now: () => number;
  private limits: Limits;
  constructor(now: () => number = Date.now, limits: Limits = { client: PER_CLIENT, global: GLOBAL, allClient: ALL_PER_CLIENT, allGlobal: ALL_GLOBAL, inFlight: IN_FLIGHT }) {
    this.now = now; this.limits = limits;
  }
  take(client: string): Taken {
    const t = this.now(), L = this.limits;
    const live = (xs: number[], w: Window) => xs.filter((x) => t - x < w.ms);
    for (const [k, xs] of this.outer) if (!xs.length || t - xs[xs.length - 1] >= L.allClient.ms) { this.outer.delete(k); this.tight.delete(k); }
    const wait = (xs: number[], w: Window) => Math.ceil((xs[0] + w.ms - t) / 1000);
    const mine = live(this.tight.get(client) ?? [], L.client), mineAll = live(this.outer.get(client) ?? [], L.allClient);
    this.tightAll = live(this.tightAll, L.global); this.outerAll = live(this.outerAll, L.allGlobal);
    if (this.flying >= L.inFlight) return { ok: false, retryAfterS: 15, why: "busy" };
    if (mineAll.length >= L.allClient.n) return { ok: false, retryAfterS: wait(mineAll, L.allClient), why: "client-all" };
    if (this.outerAll.length >= L.allGlobal.n) return { ok: false, retryAfterS: wait(this.outerAll, L.allGlobal), why: "everyone-all" };
    if (mine.length >= L.client.n) return { ok: false, retryAfterS: wait(mine, L.client), why: "client" };
    if (this.tightAll.length >= L.global.n) return { ok: false, retryAfterS: wait(this.tightAll, L.global), why: "everyone" };
    mine.push(t); this.tight.set(client, mine); this.tightAll.push(t);
    mineAll.push(t); this.outer.set(client, mineAll); this.outerAll.push(t);
    this.flying++;
    let released = false, refunded = false;
    const drop = (xs: number[]) => { const i = xs.lastIndexOf(t); if (i >= 0) xs.splice(i, 1); };
    return {
      ok: true,
      release: () => { if (!released) { released = true; this.flying--; } },
      refund: () => { if (!refunded) { refunded = true; drop(this.tight.get(client) ?? []); drop(this.tightAll); } },
    };
  }
}

export type Large = { name: string; model: string; minTier: string } | null;

/** The card's large route ({name, model, minTier}: the smallest tier it forwards, "large" when the card does not say, as in
 * d1a), or null when the model server routes nothing to a large model. */
export function largeRoute(card: unknown): Large {
  const routes = (card as { routes?: unknown })?.routes;
  if (!Array.isArray(routes)) return null;
  const r = routes.find((x) => x && typeof x === "object" && (x as { kind?: unknown }).kind === "openai") as { name?: unknown; model?: unknown; min_tier?: unknown } | undefined;
  if (!r || typeof r.name !== "string" || typeof r.model !== "string") return null;
  return { name: r.name, model: r.model, minTier: r.min_tier === "medium" ? "medium" : "large" };
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

export type CardDeps = Pick<Deps, "env" | "fetch" | "readKey">;

async function headers(deps: CardDeps): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (deps.env.CHAT_KEY_FILE) h.Authorization = `Bearer ${(await deps.readKey(deps.env.CHAT_KEY_FILE)).trim()}`;
  return h;
}

/** The model server's card, for its large route; null when it cannot be read. */
export async function card(deps: CardDeps): Promise<unknown> {
  try {
    const r = await deps.fetch(`${chatApi(deps.env)}/v1/models`, { headers: await headers(deps), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    return (await r.json() as { models?: unknown[] }).models?.[0] ?? null;
  } catch { return null; }
}

/** GET: whether Ask sends the chat: the demo is on (ROUTE_DEMO=1) and the model server has a large route. */
export async function status(deps: Deps): Promise<Response> {
  if (deps.env.ROUTE_DEMO !== "1") return json({ on: false });
  const large = largeRoute(await card(deps));
  return json({ on: Boolean(large), large: large?.model ?? null, limits: { prompt: PROMPT_MAX, perClient: PER_CLIENT, everyone: GLOBAL, allPerClient: ALL_PER_CLIENT, allEveryone: ALL_GLOBAL } });
}

/** POST, after the cross-site check: validate, take a slot, one chat through the routes, and what the page may show. The
 * tight slot is given back only when D1A answered the chat itself with no fallback; never on a forward, a fallback, another
 * route, an error or a timeout. The in-flight slot is released on every path. */
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
    if (s.who === "d1a" && !s.note) slot.refund();
    return json({ ...s, route, routeError, model: typeof body?.model === "string" ? body.model : null, large: large.model, minTier: large.minTier, ms: now() - t });
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError";
    return json({ error: timedOut ? `no answer within ${TIMEOUT_MS / 1000} s` : "the model server cannot be reached" }, 504);
  } finally {
    slot.release();
  }
}

/** A reply to POST /api/route-chat with status 200: what the page may show, the route headers and the time taken. */
export type Reply = Shown & { route?: string | null; routeError?: string | null; model?: string | null; large?: string; minTier?: string; ms?: number };
export type NotSent = "off" | "trap" | "long" | "invalid" | Why;
/** The page's reading of one Ask: an answer; nothing sent, and why; or sent with no answer back. */
export type Outcome =
  | { phase: "answered"; reply: Reply }
  | { phase: "not-sent"; why: NotSent; retryAfterS?: number; detail?: string }
  | { phase: "failed"; detail: string };

const LIMITS: readonly string[] = ["client", "everyone", "client-all", "everyone-all", "busy"];

/** Reads POST /api/route-chat's status and body. 404 and 503 mean this playground sends no chat; 400, 413 and 429 mean this
 * one was not sent; 502 and 504 mean it was sent and no answer came back. */
export function outcome(status: number, body: unknown, prompt: string): Outcome {
  const j = (body && typeof body === "object" ? body : {}) as { error?: unknown; retryAfterS?: unknown };
  const error = typeof j.error === "string" ? j.error : `HTTP ${status}`;
  if (status === 200) {
    const r = body as Partial<Reply> | null;
    const ok = r && ["d1a", "large", "none"].includes(r.who as string) && typeof r.answer === "string";
    return ok ? { phase: "answered", reply: r as Reply } : { phase: "failed", detail: "the reply could not be read" };
  }
  if (status === 404 || status === 503) return { phase: "not-sent", why: "off" };
  if (status === 413) return { phase: "not-sent", why: "long" };
  if (status === 400) return REVIEW_TRAP.test(prompt) ? { phase: "not-sent", why: "trap" } : { phase: "not-sent", why: "invalid", detail: error };
  if (status === 429) return { phase: "not-sent", why: (LIMITS.includes(error) ? error : "busy") as Why, retryAfterS: typeof j.retryAfterS === "number" ? j.retryAfterS : 60 };
  return { phase: "failed", detail: error };
}
