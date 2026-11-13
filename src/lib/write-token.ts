// The write token as the pages send it (src/lib/guard.ts tokenRefusal): kept in this browser once given, and sent with each
// call that may need it. A refusal that asks for the token (401 with WWW-Authenticate: Bearer) forgets a stored one, asks
// once, and tries once more; a token is kept only when the server took it.
const KEY = "d1a-write-token";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Deps = { fetch: typeof fetch; storage: Store | null; ask: (message: string) => string | null };

function browser(): Deps {
  let storage: Store | null = null;
  try { storage = window.localStorage; } catch { /* blocked storage: ask on each refusal */ }
  return { fetch: (input, init) => fetch(input, init), storage, ask: (message) => window.prompt(message) };
}

const asksForToken = (r: Response) => r.status === 401 && /^bearer/i.test(r.headers.get("www-authenticate") ?? "");

export async function tokenFetch(url: string, init: RequestInit = {}, deps: Deps = browser()): Promise<Response> {
  const store = (f: (s: Store) => void) => { try { if (deps.storage) f(deps.storage); } catch { /* not kept */ } };
  let stored = "";
  store((s) => { stored = s.getItem(KEY) ?? ""; });
  const send = (token: string) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    return deps.fetch(url, { ...init, headers });
  };
  const first = await send(stored);
  if (!asksForToken(first)) return first;
  if (stored) store((s) => s.removeItem(KEY));
  const given = deps.ask(`${stored ? "That write token was refused. " : ""}This playground needs its write token (WRITE_TOKEN in .demo/mini.env on the Mac that serves it):`)?.trim();
  if (!given) return first;
  const again = await send(given);
  if (!asksForToken(again)) store((s) => s.setItem(KEY, given));
  return again;
}
