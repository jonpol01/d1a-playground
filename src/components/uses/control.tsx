"use client";

import { useEffect, useRef, useState } from "react";
import type { Answer, Question } from "@/lib/kev";
import { Button } from "@/components/ui/button";
import { accentButton, AnswerBars, ask, ErrorNote, ResultCard } from "@/components/uses/shared";
import { useText, type Lang } from "@/lib/i18n";

export const CELLS = 21;          // cells 0..20
const TICK_MS = 100;       // the control loop runs at 10 Hz; a tick with a request still in flight is skipped, never queued
const TARGET_EVERY = 8;    // the target moves one cell every 8 ticks (0.8 s)

export const MOVE_Q: Record<string, Question> = {
  move: {
    type: "choice",
    instructions: "The robot must move toward the target. Which move?",
    criteria: { stay: "The robot is already on the target", right: "The target is to the right", left: "The target is to the left" },
  },
};

// The state is machine-generated and stays English in both languages: the prototype follows it with p 0.75-0.96,
// against 0.64-0.92 for the same sentences in Japanese.
export function describe(robot: number, target: number, hint: boolean) {
  const base = `Robot at cell ${robot}. Target at cell ${target}.`;
  if (!hint) return `1-D track with cells 0 to ${CELLS - 1}. ${base}`;
  if (robot === target) return `${base} The robot is on the target.`;
  const d = Math.abs(target - robot);
  return `${base} The target is ${d} ${d === 1 ? "cell" : "cells"} to the ${target < robot ? "left" : "right"} of the robot.`;
}

const CONTROL_EN = {
  start: "Start", stop: "Stop", pressStart: "press Start", thinking: "thinking…", perSec: "decisions/s",
  hint: "spell out the direction in the state (off: positions only)",
  canvas: "Robot (square) chasing the target (star) on a 1-D track",
  stats: { last: "last decision", avg: "avg latency (last 20)", rate: "decisions / s", skipped: "ticks skipped", on: "on target" },
  skippedOf: (a: number, b: number) => `${a} of ${b}`, onPct: (n: number) => `${n}% of ticks`,
  stateTitle: "state sent on the last decision",
  note: (hz: number) => `The loop ticks at ${hz} Hz, but a new state is sent only when the previous answer has come back, so the decision rate is set by the model's latency and ticks in between are skipped rather than queued. With the direction spelled out the prototype checkpoint follows well; with positions only it has to compare two numbers itself and often drifts left.`,
};
const CONTROL_TEXT: Record<Lang, typeof CONTROL_EN> = {
  en: CONTROL_EN,
  ja: {
    start: "スタート", stop: "停止", pressStart: "スタートを押してください", thinking: "考え中…", perSec: "回/秒",
    hint: "state に方向を書き添える（オフ: 位置だけ）",
    canvas: "1次元のトラック上でターゲット（星）を追いかけるロボット（四角）",
    stats: { last: "直近の判断", avg: "平均レイテンシ（直近20回）", rate: "判断 / 秒", skipped: "スキップしたティック", on: "ターゲット上" },
    skippedOf: (a: number, b: number) => `${b} 中 ${a}`, onPct: (n: number) => `ティックの ${n}%`,
    stateTitle: "直近の判断で送った state（英語のまま送っています）",
    note: (hz: number) => `ループは ${hz} Hz で回りますが、新しい state を送るのは前の答えが返ってきてからです。そのため判断の頻度はモデルのレイテンシで決まり、その間のティックはキューに積まずにスキップします。方向を書き添えるとプロトタイプはよく追従します。位置だけだと2つの数を自分で比べる必要があり、左に流れがちです。`,
  },
};

type Stats = { decisions: number; skipped: number; onTarget: number; ticks: number; lastMs: number; avgMs: number; rate: number; last: Answer | null; lastState: string };
const ZERO: Stats = { decisions: 0, skipped: 0, onTarget: 0, ticks: 0, lastMs: 0, avgMs: 0, rate: 0, last: null, lastState: "" };

export function ControlDemo() {
  const t = useText(CONTROL_TEXT);
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState(true);
  const [stats, setStats] = useState<Stats>(ZERO);
  const [error, setError] = useState<unknown>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef({ robot: 3, target: 15, vel: 1, inFlight: false, trail: [] as number[], hud: t.pressStart, hudRight: "", lat: [] as number[], t0: 0, tick: 0, s: ZERO, timer: 0 as number | ReturnType<typeof setInterval>, alive: true });

  function draw() {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = world.current;
    const W = c.width, H = c.height, cw = W / CELLS, ty = H - 46, y = ty - 34;
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1e1b4b"); bg.addColorStop(0.6, "#3b0764"); bg.addColorStop(1, "#831843");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {   // fixed starfield
      ctx.fillStyle = `rgba(255,255,255,${0.15 + ((i * 53) % 10) / 25})`;
      ctx.fillRect((i * 197) % W, (i * 71) % (ty - 50), 2, 2);
    }
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath(); ctx.roundRect(8, ty, W - 16, 14, 7); ctx.fill();
    for (let i = 0; i < CELLS; i++) {
      ctx.fillStyle = i === w.target ? "#fbbf24" : "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(i * cw + cw / 2, ty + 7, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    w.trail.forEach((x, k) => {   // fading trail of the robot's last cells
      ctx.fillStyle = `rgba(244,114,182,${((k + 1) / w.trail.length) * 0.35})`;
      ctx.beginPath(); ctx.arc(x * cw + cw / 2, y, cw * 0.18 + k, 0, Math.PI * 2); ctx.fill();
    });
    ctx.save();
    ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 24; ctx.fillStyle = "#fbbf24";
    const tx = w.target * cw + cw / 2;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {   // a star for the target
      const r = k % 2 ? cw * 0.18 : cw * 0.42, a = -Math.PI / 2 + (k * Math.PI) / 5;
      ctx.lineTo(tx + Math.cos(a) * r, y - 26 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
    const rx = w.robot * cw + cw / 2, s = cw * 0.62;
    ctx.save(); ctx.shadowColor = "#f472b6"; ctx.shadowBlur = 18; ctx.fillStyle = "#f472b6";
    ctx.beginPath(); ctx.roundRect(rx - s / 2, y - s / 2, s, s, 8); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#1e1b4b";
    const look = w.target === w.robot ? 0 : w.target > w.robot ? 3 : -3;
    ctx.beginPath(); ctx.arc(rx - 6 + look, y - 3, 3, 0, Math.PI * 2); ctx.arc(rx + 6 + look, y - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "600 13px ui-monospace, monospace";
    ctx.fillText(w.hud, 14, 22);
    ctx.textAlign = "right"; ctx.fillText(w.hudRight, W - 14, 22); ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("0", 12, H - 10); ctx.textAlign = "right"; ctx.fillText(String(CELLS - 1), W - 12, H - 10); ctx.textAlign = "left";
  }

  useEffect(() => {
    const w = world.current;
    w.alive = true;
    draw();
    return () => { w.alive = false; clearInterval(w.timer); };
  }, []);

  function decide(useHint: boolean) {
    const w = world.current;
    w.inFlight = true;
    const state = describe(w.robot, w.target, useHint);
    ask(state, MOVE_Q).then((r) => {
      if (!w.alive || !w.timer) return;
      const a = r.answers.move;
      w.trail.push(w.robot); if (w.trail.length > 6) w.trail.shift();
      if (a.type === "choice") w.robot = Math.max(0, Math.min(CELLS - 1, w.robot + (a.choice === "left" ? -1 : a.choice === "right" ? 1 : 0)));
      if (a.type === "choice") w.hud = `${a.choice.toUpperCase()}  p ${a.probabilities[a.choice].toFixed(2)}  ·  ${r.latency_ms.toFixed(0)} ms`;
      w.lat.push(r.latency_ms); if (w.lat.length > 20) w.lat.shift();
      const elapsed = (performance.now() - w.t0) / 1000;
      w.hudRight = `${((w.s.decisions + 1) / ((performance.now() - w.t0) / 1000)).toFixed(1)} ${t.perSec}`;
      w.s = { ...w.s, decisions: w.s.decisions + 1, lastMs: r.latency_ms, avgMs: w.lat.reduce((x, y) => x + y, 0) / w.lat.length, rate: (w.s.decisions + 1) / elapsed, last: a, lastState: state };
      setStats(w.s);
      draw();
    }).catch((e) => { if (w.alive) { stop(); setError(e); } })
      .finally(() => { w.inFlight = false; });
  }

  function start() {
    const w = world.current;
    setError(null);
    w.s = ZERO; w.lat = []; w.trail = []; w.t0 = performance.now(); w.tick = 0; w.hud = t.thinking; w.hudRight = "";
    setStats(ZERO); setRunning(true);
    const useHint = hint;
    w.timer = setInterval(() => {
      w.tick++;
      if (w.tick % TARGET_EVERY === 0) {
        if (Math.random() < 0.15) w.vel = -w.vel;                          // wander, mostly keeping its direction
        const next = w.target + w.vel;
        if (next < 0 || next >= CELLS) w.vel = -w.vel;
        w.target = Math.max(0, Math.min(CELLS - 1, w.target + w.vel));
      }
      const skipped = w.inFlight ? 1 : 0;
      w.s = { ...w.s, ticks: w.s.ticks + 1, skipped: w.s.skipped + skipped, onTarget: w.s.onTarget + (w.robot === w.target ? 1 : 0) };
      if (!w.inFlight) decide(useHint);
      setStats(w.s);
      draw();
    }, TICK_MS);
  }

  function stop() {
    const w = world.current;
    clearInterval(w.timer); w.timer = 0;
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={running ? stop : start} className={accentButton}>{running ? t.stop : t.start}</Button>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input type="checkbox" checked={hint} disabled={running} onChange={(e) => setHint(e.target.checked)} className="accent-foreground" />
          {t.hint}
        </label>
      </div>
      <canvas ref={canvas} width={840} height={170} className="h-auto w-full rounded-2xl shadow-lg" aria-label={t.canvas} />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-5">
        {[
          [t.stats.last, stats.decisions ? `${stats.lastMs.toFixed(0)} ms` : "–"],
          [t.stats.avg, stats.decisions ? `${stats.avgMs.toFixed(0)} ms` : "–"],
          [t.stats.rate, stats.decisions ? stats.rate.toFixed(1) : "–"],
          [t.stats.skipped, t.skippedOf(stats.skipped, stats.ticks)],
          [t.stats.on, stats.ticks ? t.onPct(Math.round((stats.onTarget / stats.ticks) * 100)) : "–"],
        ].map(([k, v]) => (
          <div key={k}><dt className="text-[12px] text-muted-foreground">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <ErrorNote error={error} />
      {stats.last && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultCard title={t.stateTitle}><pre className="whitespace-pre-wrap font-mono text-[12px] leading-5">{stats.lastState}</pre></ResultCard>
          <ResultCard title="move · choice"><AnswerBars answer={stats.last} /></ResultCard>
        </div>
      )}
      <p className="text-[12px] leading-5 text-muted-foreground">
        {t.note(1000 / TICK_MS)}
      </p>
    </div>
  );
}
