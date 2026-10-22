// What the web app lets a request reach (src/lib/guard.ts). Run: node --test scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import { crossSiteRefusal, proxyRewrites } from "../src/lib/guard.ts";

test("the proxies forward the pages' model routes and nothing else: never POST /v1/feedback", () => {
  const rules = proxyRewrites("http://127.0.0.1:8009", "http://127.0.0.1:8010");
  assert.deepEqual(rules.map((r) => r.source).sort(), ["/kev/v1/models", "/kev/v1/systemone", "/kev/v1/systemone/permute",
                                                       "/kev/v1/systemone/separate", "/media/v1/systemone/media"]);
  for (const r of rules) {
    assert.ok(!/[:*(]/.test(r.source), `${r.source} is a pattern, not a route`);   // a catch-all once forwarded /v1/feedback
    assert.equal(r.destination, (r.source.startsWith("/kev/") ? "http://127.0.0.1:8009/" : "http://127.0.0.1:8010/") + r.source.split("/").slice(2).join("/"));
  }
  assert.ok(!rules.some((r) => r.source.includes("feedback")));
});

const post = (headers) => new Request("http://mini.local/d1a/api/learning", { method: "POST", headers, body: "{}" });

test("a write from the app's own pages passes: JSON, same-origin (or a script, which sends no Sec-Fetch-Site)", () => {
  assert.equal(crossSiteRefusal(post({ "content-type": "application/json", "sec-fetch-site": "same-origin" })), null);
  assert.equal(crossSiteRefusal(post({ "content-type": "application/json; charset=utf-8" })), null);
  assert.equal(crossSiteRefusal(post({ "content-type": "application/json", "sec-fetch-site": "none" })), null);
});

test("a write another site's page could send is refused", async () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""]) {
    const r = crossSiteRefusal(post(type ? { "content-type": type } : {}));
    assert.equal(r?.status, 415, `content-type ${type || "(none)"} passed`);   // these need no CORS preflight
  }
  for (const site of ["cross-site", "same-site"]) {
    const r = crossSiteRefusal(post({ "content-type": "application/json", "sec-fetch-site": site }));
    assert.equal(r?.status, 403, `sec-fetch-site ${site} passed`);
    assert.match((await r.json()).error, /another site/);
  }
});
