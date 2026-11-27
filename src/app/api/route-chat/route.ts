import { readFile } from "node:fs/promises";
import { demoRefusal } from "@/lib/guard";
import { Limiter, send, status, type Deps } from "@/lib/route-chat";

// The routing demo's chat call (src/lib/route-chat.ts): off (404) unless the web app runs with ROUTE_DEMO=1. A demo for
// anyone who opens the playground, so it takes no write token: the cross-site check only, and the limits of route-chat.ts.
export const dynamic = "force-dynamic";

const limiter = new Limiter();
const deps = (): Deps => ({
  env: process.env, fetch, limiter,
  readKey: (path) => readFile(/* turbopackIgnore: true */ path, "utf8"),   // a key file of this machine, read when used
});

export async function GET() {
  return status(deps());
}

export async function POST(req: Request) {
  const refused = demoRefusal(req);
  if (refused) return refused;
  return send(req, deps());
}
