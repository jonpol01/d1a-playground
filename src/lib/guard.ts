// What the web app lets a request reach. Anyone who can open the app (on the serving Mac: the LAN, through its port-80
// proxy) can call these, so each is kept to what the pages themselves use.

// The model server routes the pages call through the app (next.config.ts rewrites). A catch-all forwarded every route,
// POST /v1/feedback included: anyone who reached the app could write outcomes, marked human, into the PR labeler's
// self-learning loop. The OpenAI port (scripts/openai_port.mjs) already refuses /v1/feedback; this does the same here.
export const KEV_ROUTES = ["v1/models", "v1/systemone", "v1/systemone/separate", "v1/systemone/permute"] as const;
export const MEDIA_ROUTES = ["v1/systemone/media"] as const;

export function proxyRewrites(kevApi: string, mediaApi: string) {
  return [
    ...KEV_ROUTES.map((p) => ({ source: `/kev/${p}`, destination: `${kevApi}/${p}` })),
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
