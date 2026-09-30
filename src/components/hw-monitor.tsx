"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Activity, ChevronDown, Cpu, Gpu, MemoryStick, Server, Zap, type LucideIcon } from "lucide-react";
import type { Hw } from "@/lib/hw";
import { BASE_PATH } from "@/lib/kev";
import { useText, type Lang } from "@/lib/i18n";
import { useSamples, type Sample } from "@/lib/metrics";

export type ModelMeta = { run: string; base: string; device?: string; backend?: string; dtype?: string };

const POLL_MS = 2000;
const WINDOW_MS = 30_000;   // throughput is averaged over the requests of the last 30 s

const TEXT_EN = {
  title: "Hardware monitor", show: "Show", hide: "Hide",
  backend: "BACKEND", latency: "LATENCY", throughput: "THROUGHPUT", gpu: "GPU", memory: "MEMORY", cpu: "CPU",
  connecting: "connecting…", rtt: (ms: string) => `round trip ${ms} ms`, waiting: "waiting for a request",
  status: ["Excellent", "Good", "Moderate", "Slow"],
  qps: "questions/s", tps: (n: string) => `${n} input tokens/s · last 30 s`, idle: "idle",
  inUse: "in use", cores: (n: number) => `${n}-core`, serverMem: "model server", remote: "model server on another host",
  free: (n: number) => `${n}% free`, swap: (s: string) => `swap ${s}`, load: "load", threads: (n: number) => `${n} cores`,
};
const TEXT: Record<Lang, typeof TEXT_EN> = {
  en: TEXT_EN,
  ja: {
    title: "ハードウェアモニター", show: "表示", hide: "隠す",
    backend: "バックエンド", latency: "レイテンシ", throughput: "スループット", gpu: "GPU", memory: "メモリ", cpu: "CPU",
    connecting: "接続中…", rtt: (ms: string) => `往復 ${ms} ms`, waiting: "リクエスト待ち",
    status: ["非常に速い", "速い", "普通", "遅い"],
    qps: "質問/秒", tps: (n: string) => `入力トークン ${n}/秒 · 直近30秒`, idle: "待機中",
    inUse: "使用中", cores: (n: number) => `${n} コア`, serverMem: "モデルサーバー", remote: "モデルサーバーは別のホスト",
    free: (n: number) => `空き ${n}%`, swap: (s: string) => `スワップ ${s}`, load: "負荷", threads: (n: number) => `${n} コア`,
  },
};

const DASH = "—";
function bytes(n: number | null | undefined) {
  if (n == null) return DASH;
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

function backendLabel(m: ModelMeta) {
  if (m.backend === "lmstudio") return "LM Studio";
  const dtype = { bfloat16: "bf16", float16: "fp16", float32: "fp32" }[m.dtype ?? ""] ?? m.dtype;
  const dev = m.backend === "mlx" ? "Apple GPU · MLX"
    : m.device === "mps" ? "Apple GPU · Metal (MPS)"
    : m.device?.startsWith("cuda") ? "NVIDIA GPU · CUDA"
    : m.device === "cpu" ? "CPU" : m.device ?? DASH;
  return dtype ? `${dev} · ${dtype}` : dev;
}

// Status word and colour for a server-side latency, as in the snake-ai monitor.
const LAT_TONES = ["#10b981", "#22c55e", "#f59e0b", "#ef4444"];
const latTone = (ms: number) => (ms < 250 ? 0 : ms < 600 ? 1 : ms < 1500 ? 2 : 3);
const barColor = (ratio: number) => (ratio < 0.4 ? "#10b981" : ratio < 0.7 ? "#4ade80" : ratio < 0.9 ? "#f59e0b" : "#ef4444");

function Spark({ samples }: { samples: Sample[] }) {
  const max = Math.max(1, ...samples.map((s) => s.latencyMs));
  return (
    <div className="flex h-7 items-end gap-px" aria-hidden>
      {Array.from({ length: 40 }, (_, i) => {
        const s = samples[i - (40 - samples.length)];
        const ratio = s ? s.latencyMs / max : 0;
        return <span key={i} className="w-[3px] shrink-0 rounded-[1px] transition-all duration-150" style={{ height: s ? Math.max(2, ratio * 28) : 1, background: s ? barColor(ratio) : "var(--border)" }} />;
      })}
    </div>
  );
}

function Row({ Icon, color, title, value, sub, children }: { Icon: LucideIcon; color: string; title: string; value: ReactNode; sub: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ color, background: `color-mix(in oklch, ${color} 12%, transparent)`, borderColor: `color-mix(in oklch, ${color} 35%, transparent)` }}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-medium tracking-[0.12em] text-muted-foreground">{title}</p>
        <p className="truncate text-[13px] font-semibold tabular-nums">{value}</p>
        <p className="truncate text-[11px] leading-4 text-muted-foreground">{sub}</p>
        {children}
      </div>
    </div>
  );
}

export function HwMonitor({ model }: { model: ModelMeta | { error: string } | null }) {
  const t = useText(TEXT);
  const samples = useSamples();
  const [hw, setHw] = useState<Hw | null>(null);
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    function tick() {
      if (document.visibilityState !== "visible") return;   // no polling from a background tab
      setNow(Date.now());
      fetch(`${BASE_PATH}/api/hw`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Hw | null) => { if (alive && j) setHw(j); })
        .catch(() => { /* keep the last reading */ });
    }
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; clearTimeout(first); clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, []);

  const meta = model && !("error" in model) ? model : null;
  const last = samples.at(-1);
  const clock = Math.max(now, last?.at ?? 0);
  const recent = samples.filter((s) => clock - s.at < WINDOW_MS);
  const span = recent.length ? Math.max(1, (clock - (recent[0].at - recent[0].rttMs)) / 1000) : 1;
  const qps = recent.reduce((a, s) => a + s.questions, 0) / span;
  const tps = recent.reduce((a, s) => a + s.tokens, 0) / span;
  const tone = last ? latTone(last.latencyMs) : null;
  const gpuUtil = hw?.gpu.utilPct ?? null;

  return (
    <section aria-label={t.title} className="mt-5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground">
        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-50" /><span className="relative inline-flex size-2 rounded-full bg-sky-500" /></span>
        <span className="font-medium">{t.title}</span>
        {!open && <span className="tabular-nums">· GPU {gpuUtil ?? DASH}% · {last ? `${last.latencyMs.toFixed(0)} ms` : DASH} · {recent.length ? qps.toFixed(1) : DASH} {t.qps}</span>}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Row Icon={Server} color="#3b82f6" title={t.backend}
            value={meta ? backendLabel(meta) : model ? DASH : t.connecting}
            sub={meta ? <><span className="font-mono">{meta.run}</span>{hw?.gpu.name ? ` · ${hw.gpu.name}` : ""}</> : DASH} />
          <Row Icon={Activity} color="#10b981" title={t.latency}
            value={last ? <>{last.latencyMs.toFixed(0)} ms <span className="text-[11px] font-medium" style={{ color: LAT_TONES[tone!] }}>{t.status[tone!]}</span></> : DASH}
            sub={last ? t.rtt(last.rttMs.toFixed(0)) : t.waiting}>
            <div className="mt-1"><Spark samples={samples} /></div>
          </Row>
          <Row Icon={Zap} color="#f97316" title={t.throughput}
            value={recent.length ? <>{qps.toFixed(1)} <span className="text-[11px] font-normal text-muted-foreground">{t.qps}</span></> : DASH}
            sub={recent.length ? t.tps(Math.round(tps).toLocaleString()) : t.idle} />
          <Row Icon={Gpu} color="#6366f1" title={t.gpu}
            value={gpuUtil != null ? `${gpuUtil}%` : DASH}
            sub={[hw?.gpu.memUsedBytes != null ? `${bytes(hw.gpu.memUsedBytes)}${hw.gpu.memTotalBytes ? ` / ${bytes(hw.gpu.memTotalBytes)}` : ""} ${t.inUse}` : null,
              hw?.gpu.cores ? t.cores(hw.gpu.cores) : null, hw?.gpu.tempC != null ? `${hw.gpu.tempC}°C` : null, hw?.gpu.powerW != null ? `${hw.gpu.powerW.toFixed(0)} W` : null].filter(Boolean).join(" · ") || DASH}>
            <div className="mt-1.5 h-1 w-full rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-indigo-500 transition-[width] duration-500" style={{ width: `${gpuUtil ?? 0}%` }} /></div>
          </Row>
          <Row Icon={MemoryStick} color="#a855f7" title={t.memory}
            value={hw?.server.memBytes != null ? <>{bytes(hw.server.memBytes)} <span className="text-[11px] font-normal text-muted-foreground">{t.serverMem}</span></> : hw && !hw.server.local ? <span className="text-[12px] font-normal text-muted-foreground">{t.remote}</span> : DASH}
            sub={[hw?.memFreePct != null ? t.free(hw.memFreePct) : null, hw?.swapUsedBytes != null ? t.swap(bytes(hw.swapUsedBytes)) : null].filter(Boolean).join(" · ") || DASH} />
          <Row Icon={Cpu} color="#f59e0b" title={t.cpu}
            value={hw?.load1 != null ? <>{hw.load1.toFixed(2)} <span className="text-[11px] font-normal text-muted-foreground">{t.load}</span></> : DASH}
            sub={hw ? [hw.chip, t.threads(hw.cores), bytes(hw.ramBytes)].filter(Boolean).join(" · ") : DASH} />
        </div>
      )}
    </section>
  );
}
