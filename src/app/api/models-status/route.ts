import { readFile } from "node:fs/promises";
import { status } from "@/lib/models-status";
import { card } from "@/lib/route-chat";

// The routing demo's model chips (src/lib/models-status.ts): GET only, read from D1A's card; it never sends a chat and
// changes nothing, so it takes no write token.
export const dynamic = "force-dynamic";

export async function GET() {
  const deps = { env: process.env, fetch, readKey: (path: string) => readFile(/* turbopackIgnore: true */ path, "utf8") };
  return Response.json(await status(() => card(deps), process.env), { headers: { "cache-control": "no-store" } });
}
