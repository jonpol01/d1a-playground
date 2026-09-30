"use client";

import { useSyncExternalStore } from "react";

// The last requests the demos sent, for the hardware monitor: the server's own latency, the browser's round trip,
// and how much work each request carried.
export type Sample = { at: number; latencyMs: number; rttMs: number; questions: number; tokens: number };

const MAX = 40;
const EMPTY: Sample[] = [];
let samples: Sample[] = EMPTY;
const listeners = new Set<() => void>();

export function recordRequest(s: Sample) {
  samples = [...samples.slice(-(MAX - 1)), s];
  listeners.forEach((f) => f());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useSamples(): Sample[] {
  return useSyncExternalStore(subscribe, () => samples, () => EMPTY);
}
