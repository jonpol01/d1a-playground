import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import type { Hw } from "@/lib/hw";

// Live machine stats for the hardware monitor, read from the host that runs this app (and, when KEV_API is local,
// the model server's process). Only cheap, unprivileged commands; each has a short timeout, a missing tool or a
// failed command leaves its field null, and the result is shared for CACHE_MS so polling browsers cost one read.
export const dynamic = "force-dynamic";

const CACHE_MS = 1500;
const KEV_API = process.env.KEV_API ?? "http://127.0.0.1:8009";
let cached: { at: number; value: Promise<Hw> } | null = null;

function run(cmd: string, args: string[], timeout = 1500): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout, maxBuffer: 8 << 20 }, (err, stdout) => resolve(err ? null : stdout));
    } catch {
      resolve(null);
    }
  });
}

const num = (s: string | undefined | null) => (s == null || s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
const UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };

function serverTarget() {
  try {
    const u = new URL(KEV_API);
    const local = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname);
    return { local, port: u.port || (u.protocol === "https:" ? "443" : "80") };
  } catch {
    return { local: false, port: "" };
  }
}

async function serverPid(port: string): Promise<number | null> {
  const out = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return num(out?.split("\n")[0]);
}

async function mac(base: Hw): Promise<Hw> {
  const target = serverTarget();
  const [ioreg, pressure, swap, pid] = await Promise.all([
    run("ioreg", ["-r", "-d", "1", "-c", "IOAccelerator"]),
    run("memory_pressure", []),
    run("sysctl", ["-n", "vm.swapusage"]),
    target.local ? serverPid(target.port) : Promise.resolve(null),
  ]);
  const fp = pid ? await run("footprint", ["-p", String(pid)]) : null;
  const fpm = fp ? /Footprint:\s*([\d.]+)\s*(B|KB|MB|GB|TB)/.exec(fp) : null;
  const swm = swap ? /used = ([\d.]+)([KMG])/.exec(swap) : null;
  return {
    ...base,
    memFreePct: num(pressure ? /free percentage:\s*(\d+)%/.exec(pressure)?.[1] : null),
    swapUsedBytes: swm ? Number(swm[1]) * UNITS[swm[2]] : null,
    gpu: {
      ...base.gpu,
      name: ioreg ? /"model" = "([^"]+)"/.exec(ioreg)?.[1] ?? null : null,
      cores: num(ioreg ? /"gpu-core-count" = (\d+)/.exec(ioreg)?.[1] : null),
      utilPct: num(ioreg ? /"Device Utilization %"=(\d+)/.exec(ioreg)?.[1] : null),
      memUsedBytes: num(ioreg ? /"In use system memory"=(\d+)/.exec(ioreg)?.[1] : null),
    },
    server: { local: target.local, pid, memBytes: fpm ? Number(fpm[1]) * UNITS[fpm[2]] : null },
  };
}

async function linux(base: Hw): Promise<Hw> {
  const target = serverTarget();
  const [smi, meminfo, pid] = await Promise.all([
    run("nvidia-smi", ["--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw", "--format=csv,noheader,nounits"]),
    readFile("/proc/meminfo", "utf8").catch(() => null),
    target.local ? serverPid(target.port) : Promise.resolve(null),
  ]);
  const status = pid ? await readFile(`/proc/${pid}/status`, "utf8").catch(() => null) : null;
  const kb = (key: string) => num(meminfo ? new RegExp(`^${key}:\\s+(\\d+) kB`, "m").exec(meminfo)?.[1] : null);
  const total = kb("MemTotal"), avail = kb("MemAvailable"), swapTotal = kb("SwapTotal"), swapFree = kb("SwapFree");
  const g = smi?.split("\n")[0]?.split(",").map((s) => s.trim());
  const rss = num(status ? /^VmRSS:\s+(\d+) kB/m.exec(status)?.[1] : null);
  return {
    ...base,
    memFreePct: total && avail != null ? Math.round((avail / total) * 100) : null,
    swapUsedBytes: swapTotal != null && swapFree != null ? (swapTotal - swapFree) * 1024 : null,
    gpu: g && g.length >= 6 ? {
      name: g[0] || null, cores: null, utilPct: num(g[1]),
      memUsedBytes: num(g[2]) != null ? num(g[2])! * UNITS.MB : null, memTotalBytes: num(g[3]) != null ? num(g[3])! * UNITS.MB : null,
      tempC: num(g[4]), powerW: num(g[5]),
    } : base.gpu,
    server: { local: target.local, pid, memBytes: rss != null ? rss * 1024 : null },
  };
}

async function read(): Promise<Hw> {
  const cpus = os.cpus();
  const base: Hw = {
    platform: process.platform,
    chip: cpus[0]?.model?.trim() || null,
    cores: cpus.length,
    ramBytes: os.totalmem(),
    load1: process.platform === "win32" ? null : os.loadavg()[0],
    memFreePct: null,
    swapUsedBytes: null,
    gpu: { name: null, cores: null, utilPct: null, memUsedBytes: null, memTotalBytes: null, tempC: null, powerW: null },
    server: { local: serverTarget().local, pid: null, memBytes: null },
  };
  try {
    if (process.platform === "darwin") return await mac(base);
    if (process.platform === "linux") return await linux(base);
  } catch { /* fall through to the basics */ }
  return base;
}

export async function GET() {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) cached = { at: now, value: read() };
  return Response.json(await cached.value, { headers: { "cache-control": "no-store" } });
}
