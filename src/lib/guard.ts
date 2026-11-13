import { createHash, timingSafeEqual } from "node:crypto";

// What the web app lets a request reach. Anyone who can open the app (on the serving Mac: the LAN, through its port-80
// proxy) can call these, so each is kept to what the pages themselves use.

// The model server routes the pages call through the app (next.config.ts rewrites). A catch-all forwarded every route,
// POST /v1/feedback included: anyone who reached the app could write outcomes, marked human, into the PR labeler's
// self-learning loop. The OpenAI port (scripts/openai_port.mjs) already refuses /v1/feedback; this does the same here.
export const MODEL_ROUTES = ["v1/models", "v1/systemone", "v1/systemone/separate", "v1/systemone/permute"] as const;
export const MEDIA_ROUTES = ["v1/systemone/media"] as const;

// The model server's proxy path is /model. /kev is what it was called before: a reverse proxy or a script outside this repo
// may still send /d1a/kev/..., so it forwards the very same routes, no more.
export const MODEL_PROXY_PATHS = ["model", "kev"] as const;

// Where the model server listens: MODEL_API, or its old name KEV_API when that is unset.
export function modelApiUrl(env: Record<string, string | undefined> = process.env): string {
  return env.MODEL_API ?? env.KEV_API ?? "http://127.0.0.1:8009";
}

export function proxyRewrites(modelApi: string, mediaApi: string) {
  return [
    ...MODEL_PROXY_PATHS.flatMap((proxy) => MODEL_ROUTES.map((p) => ({ source: `/${proxy}/${p}`, destination: `${modelApi}/${p}` }))),
    ...MEDIA_ROUTES.map((p) => ({ source: `/media/${p}`, destination: `${mediaApi}/${p}` })),
  ];
}

// A request that changes something (the self-learning settings, a human label) must come from the app's own pages. A
// page on another site can send a text/plain or form POST without a CORS preflight; a JSON one it cannot (these routes
// grant none), and a browser's Sec-Fetch-Site names a cross-site request outright. -> null, or the refusal to return.
export function crossSiteRefusal(req: Request): Response | null {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return Response.json({ error: "send JSON (content-type: application/json)" }, { status: 415 });
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return Response.json({ error: "refused: a request from another site" }, { status: 403 });
  return null;
}

// With WRITE_TOKEN set (mini.sh keeps it in .demo/mini.env), the writes and the PR label check's sample also need it, sent as
// `Authorization: Bearer <token>`. crossSiteRefusal stops other websites only: any device that reaches the app (on the serving
// Mac, the LAN through its port-80 proxy) could otherwise change the self-learning settings or post labels marked human.
// Unset: as before. The digests are compared, so neither the token's length nor its bytes show in the timing. -> null, or the
// refusal to return; its WWW-Authenticate tells the pages to ask for the token (src/lib/write-token.ts).
export function tokenRefusal(req: Request, token: string = process.env.WRITE_TOKEN ?? ""): Response | null {
  if (!token) return null;
  const sent = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (sent && timingSafeEqual(digest(sent), digest(token))) return null;
  return Response.json({ error: "this playground needs its write token" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
}

// Every POST under src/app/api starts with this (scripts/test_guard.mjs checks): another site's request first, then the token.
export function writeRefusal(req: Request, token?: string): Response | null {
  return crossSiteRefusal(req) ?? tokenRefusal(req, token);
}
