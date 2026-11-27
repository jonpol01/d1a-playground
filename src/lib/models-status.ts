// The routing demo's model chips (GET /api/models-status): which model answers each tier and whether it is ready, read
// only from D1A's own card (GET /v1/models, on the server, the way the chat route reads it). Only an allow-list of
// fields reaches the browser: never a URL, a key or an error text. The status path never sends a chat.

/** Reads D1A's card (route-chat's card(): GET /v1/models on the server); null when it cannot be read. */
export type CardReader = () => Promise<unknown>;

export type State = "ready" | "busy" | "offline" | "unknown";
export type Chip = { tier: "small" | "medium" | "large"; model: string; d1a: boolean; state: State; inFlight?: number; maxInFlight?: number; waiting?: number; nightly?: boolean; backAt?: string };
export type Status = { chips: Chip[] };

const STATES = new Set(["ready", "busy", "offline"]);
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$/;
const count = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x < 10_000 ? x : undefined);
export const CACHE_MS = 5_000;

/** "20:30-03:30" -> minutes since midnight, or null when unset or not that shape. */
export function parseWindow(w: string | undefined): { start: number; end: number; endText: string } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.exec((w ?? "").trim());
  if (!m) return null;
  return { start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4], endText: `${m[3]}:${m[4]}` };
}

/** Whether `minute` (since midnight) falls in the window, which may run past midnight. */
export function inWindow(win: { start: number; end: number }, minute: number): boolean {
  return win.start <= win.end ? minute >= win.start && minute < win.end : minute >= win.start || minute < win.end;
}

/** The chips from D1A's card: small is always D1A; medium and large go to the large route's model from its min_tier
 * ("medium": both; "large" or unset: large only). Anything else on the card is dropped. */
export function chipsFrom(c: unknown, minute: number, window: string | undefined): Chip[] {
  const d1a = (tier: Chip["tier"]): Chip => ({ tier, model: "D1A", d1a: true, state: c ? "ready" : "offline" });
  const routes = (c as { routes?: unknown } | null)?.routes;
  const r = Array.isArray(routes) ? routes.find((x) => x && typeof x === "object" && (x as { kind?: unknown }).kind === "openai") as Record<string, unknown> | undefined : undefined;
  if (!r || typeof r.model !== "string" || !MODEL_NAME.test(r.model)) return [d1a("small"), d1a("medium"), d1a("large")];
  const state: State = typeof r.state === "string" && STATES.has(r.state) ? r.state as State : "unknown";
  const win = parseWindow(window);
  const nightly = state === "offline" && win !== null && inWindow(win, minute);
  const large = (tier: Chip["tier"]): Chip => ({
    tier, model: r.model as string, d1a: false, state,
    ...(count(r.in_flight) !== undefined ? { inFlight: count(r.in_flight) } : {}),
    ...(count(r.max_in_flight) !== undefined ? { maxInFlight: count(r.max_in_flight) } : {}),
    ...(count(r.waiting) !== undefined ? { waiting: count(r.waiting) } : {}),
    ...(nightly ? { nightly: true, backAt: win!.endText } : {}),
  });
  return [d1a("small"), r.min_tier === "medium" ? large("medium") : d1a("medium"), large("large")];
}

let cached: { at: number; value: Status } | null = null;

/** GET: the chips, from D1A's card at most every CACHE_MS. */
export async function status(readCard: CardReader, env: Record<string, string | undefined>, now: () => number = Date.now): Promise<Status> {
  const t = now();
  if (cached && t - cached.at < CACHE_MS) return cached.value;
  const d = new Date(t);
  const value = { chips: chipsFrom(await readCard(), d.getHours() * 60 + d.getMinutes(), env.PLAYGROUND_LARGE_OFFLINE_WINDOW) };
  cached = { at: t, value };
  return value;
}

/** For tests: forget the cached status. */
export function resetCache() { cached = null; }
