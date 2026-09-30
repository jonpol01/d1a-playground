"use client";

import { useEffect, useRef, useState } from "react";
import type { Answer, Question } from "@/lib/kev";
import { Button } from "@/components/ui/button";
import { AnswerBars, ask, ErrorNote, ResultCard } from "@/components/uses/shared";

const CELLS = 21;          // cells 0..20
const TICK_MS = 100;       // the control loop runs at 10 Hz; a tick with a request still in flight is skipped, never queued
const TARGET_EVERY = 8;    // the target moves one cell every 8 ticks (0.8 s)

const MOVE_Q: Record<string, Question> = {
  move: {
    type: "choice",
    instructions: "The robot must move toward the target. Which move?",
    criteria: { stay: "The robot is already on the target", right: "The target is to the right", left: "The target is to the left" },
  },
};

function describe(robot: number, target: number, hint: boolean) {
  const base = `Robot at cell ${robot}. Target at cell ${target}.`;
  if (!hint) return `1-D track with cells 0 to ${CELLS - 1}. ${base}`;
  if (robot === target) return `${base} The robot is on the target.`;
  const d = Math.abs(target - robot);
  return `${base} The target is ${d} ${d === 1 ? "cell" : "cells"} to the ${target < robot ? "left" : "right"} of the robot.`;
}

type Stats = { decisions: number; skipped: number; onTarget: number; ticks: number; lastMs: number; avgMs: number; rate: number; last: Answer | null; lastState: string };
const ZERO: Stats = { decisions: 0, skipped: 0, onTarget: 0, ticks: 0, lastMs: 0, avgMs: 0, rate: 0, last: null, lastState: "" };

export function ControlDemo() {
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState(true);
  const [stats, setStats] = useState<Stats>(ZERO);
  const [error, setError] = useState<unknown>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef({ robot: 3, target: 15, vel: 1, inFlight: false, lat: [] as number[], t0: 0, tick: 0, s: ZERO, timer: 0 as number | ReturnType<typeof setInterval>, alive: true });

  function draw() {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = world.current;
    const fg = getComputedStyle(c).color;
    const W = c.width, H = c.height, cw = W / CELLS;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 0.25; ctx.fillStyle = fg;
    for (let i = 0; i < CELLS; i++) ctx.fillRect(i * cw + cw / 2 - 1, H - 22, 2, 8);
    ctx.fillRect(0, H - 15, W, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#10b981";
    ctx.beginPath(); ctx.arc(w.target * cw + cw / 2, H / 2 - 12, cw * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fg;
    const s = cw * 0.55;
    ctx.fillRect(w.robot * cw + cw / 2 - s / 2, H / 2 - 12 - s / 2, s, s);
    ctx.font = "11px ui-monospace, monospace"; ctx.globalAlpha = 0.6;
    ctx.fillText("0", 4, H - 2); ctx.fillText(String(CELLS - 1), W - 16, H - 2);
    ctx.globalAlpha = 1;
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
      if (a.type === "choice") w.robot = Math.max(0, Math.min(CELLS - 1, w.robot + (a.choice === "left" ? -1 : a.choice === "right" ? 1 : 0)));
      w.lat.push(r.latency_ms); if (w.lat.length > 20) w.lat.shift();
      const elapsed = (performance.now() - w.t0) / 1000;
      w.s = { ...w.s, decisions: w.s.decisions + 1, lastMs: r.latency_ms, avgMs: w.lat.reduce((x, y) => x + y, 0) / w.lat.length, rate: (w.s.decisions + 1) / elapsed, last: a, lastState: state };
      setStats(w.s);
      draw();
    }).catch((e) => { if (w.alive) { stop(); setError(e); } })
      .finally(() => { w.inFlight = false; });
  }

  function start() {
    const w = world.current;
    setError(null);
    w.s = ZERO; w.lat = []; w.t0 = performance.now(); w.tick = 0;
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
        <Button onClick={running ? stop : start} className="rounded-md">{running ? "Stop" : "Start"}</Button>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input type="checkbox" checked={hint} disabled={running} onChange={(e) => setHint(e.target.checked)} className="accent-foreground" />
          spell out the direction in the state (off: positions only)
        </label>
      </div>
      <canvas ref={canvas} width={840} height={110} className="h-auto w-full rounded-md border border-border bg-card text-foreground" aria-label="Robot (square) chasing the target (green dot) on a 1-D track" />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-5">
        {[
          ["last decision", stats.decisions ? `${stats.lastMs.toFixed(0)} ms` : "–"],
          ["avg latency (last 20)", stats.decisions ? `${stats.avgMs.toFixed(0)} ms` : "–"],
          ["decisions / s", stats.decisions ? stats.rate.toFixed(1) : "–"],
          ["ticks skipped", `${stats.skipped} of ${stats.ticks}`],
          ["on target", stats.ticks ? `${Math.round((stats.onTarget / stats.ticks) * 100)}% of ticks` : "–"],
        ].map(([k, v]) => (
          <div key={k}><dt className="text-[12px] text-muted-foreground">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>
        ))}
      </dl>
      <ErrorNote error={error} />
      {stats.last && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultCard title="state sent on the last decision"><pre className="whitespace-pre-wrap font-mono text-[12px] leading-5">{stats.lastState}</pre></ResultCard>
          <ResultCard title="move · choice"><AnswerBars answer={stats.last} /></ResultCard>
        </div>
      )}
      <p className="text-[12px] leading-5 text-muted-foreground">
        The loop ticks at {1000 / TICK_MS} Hz, but a new state is sent only when the previous answer has come back, so the decision rate is set by Kev&apos;s latency and ticks in between are skipped rather than queued.
        With the direction spelled out the prototype checkpoint follows well; with positions only it has to compare two numbers itself and often drifts left.
      </p>
    </div>
  );
}
