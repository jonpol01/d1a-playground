// What the web app lets a request reach (src/lib/guard.ts). Run: node --test scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import { crossSiteRefusal, modelApiUrl, proxyRewrites } from "../src/lib/guard.ts";

const MODEL_ROUTES = ["v1/models", "v1/systemone", "v1/systemone/permute", "v1/systemone/separate"];
const rules = () => proxyRewrites("http://127.0.0.1:8009", "http://127.0.0.1:8010");

test("the proxies forward the pages' model routes and nothing else: never POST /v1/feedback", () => {
  assert.deepEqual(rules().map((r) => r.source).sort(), [...MODEL_ROUTES.map((p) => `/kev/${p}`), ...MODEL_ROUTES.map((p) => `/model/${p}`), "/media/v1/systemone/media"].sort());
  for (const r of rules()) {
    assert.ok(!/[:*(]/.test(r.source), `${r.source} is a pattern, not a route`);   // a catch-all once forwarded /v1/feedback
    assert.equal(r.destination, (r.source.startsWith("/media/") ? "http://127.0.0.1:8010/" : "http://127.0.0.1:8009/") + r.source.split("/").slice(2).join("/"));
  }
  assert.ok(!rules().some((r) => r.source.includes("feedback") || r.destination.includes("feedback")));
});

test("/kev, the old name of /model, forwards exactly the routes /model does, and POST /v1/feedback is refused on both", () => {
  const under = (prefix) => rules().filter((r) => r.source.startsWith(`/${prefix}/`)).map((r) => [r.source.slice(prefix.length + 2), r.destination]).sort();
  assert.equal(under("model").length, MODEL_ROUTES.length);
  assert.deepEqual(under("kev"), under("model"));
  // Next matches a rewrite by its source path (these are plain paths, asserted above), after the basePath it prefixes
  const forwards = (path, basePath = "") => rules().some((r) => basePath + r.source === path);
  for (const base of ["", "/d1a"]) {
    for (const prefix of ["model", "kev"]) {
      assert.ok(forwards(`${base}/${prefix}/v1/systemone`, base), `${base}/${prefix}/v1/systemone is not forwarded`);
      for (const route of ["v1/feedback", "v1/systemone/media", "v1/embeddings", "v1/chat/completions", "v1/learning", "v1/models/x"]) {
        assert.ok(!forwards(`${base}/${prefix}/${route}`, base), `${base}/${prefix}/${route} is forwarded`);
      }
    }
  }
});

test("MODEL_API names the model server; its old name KEV_API still does when MODEL_API is unset", () => {
  assert.equal(modelApiUrl({}), "http://127.0.0.1:8009");
  assert.equal(modelApiUrl({ KEV_API: "http://127.0.0.1:9001" }), "http://127.0.0.1:9001");
  assert.equal(modelApiUrl({ MODEL_API: "http://127.0.0.1:9002" }), "http://127.0.0.1:9002");
  assert.equal(modelApiUrl({ MODEL_API: "http://127.0.0.1:9002", KEV_API: "http://127.0.0.1:9001" }), "http://127.0.0.1:9002");
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
