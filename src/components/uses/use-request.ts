"use client";

import { useRef, useState } from "react";
import type { JSONContent, Question, SystemOneResponse } from "@/lib/kev";
import { ask } from "@/components/uses/shared";

/** One-shot Kev request state for a demo: the latest response, the latest error, and whether a request is in flight. */
export function useKevRequest() {
  const [result, setResult] = useState<SystemOneResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);   // a newer run (or a reset) wins over an older response still in flight

  async function run(state: JSONContent, questions: Record<string, Question>) {
    const id = ++seq.current;
    setBusy(true); setError(null);
    try {
      const r = await ask(state, questions);
      if (id === seq.current) setResult(r);
    } catch (e) {
      if (id === seq.current) { setError(e); setResult(null); }
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }

  function reset() { seq.current++; setResult(null); setError(null); setBusy(false); }

  return { result, error, busy, run, reset, fail: (e: unknown) => { setError(e); setResult(null); } };
}
