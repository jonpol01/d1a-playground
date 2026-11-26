"use client";

import { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/d1a";
import { useText } from "@/lib/i18n";
import { accentButton, ResultCard } from "@/components/uses/shared";

// "Send it" for the routing demo (POST /api/route-chat, src/lib/route-chat.ts): the prompt goes through the model server's real
// chat routes. Shown only when the playground runs the demo (ROUTE_DEMO=1) and the model server routes to a large model.

type Status = { on: boolean; large?: string | null };
type Reply = { who: "d1a" | "large" | "none"; answer: string; note?: "fallback" | "no-answer" | "not-shown"; model?: string | null; large?: string; ms?: number };
type Failure = { error: string; retryAfterS?: number };

const EN = {
  send: "Send it", sending: "Sending",
  title: "Sent through the router",
  intro: (m: string) => `Send it asks the real router: D1A keeps easy prompts and forwards the rest to a larger model (here ${m}). D1A's pick above is its most likely tier; the router also sends close calls up a tier, so the two can differ.`,
  limits: "Up to 2,000 characters; no pull-request links, #numbers or code blocks. 5 sends per visitor per 10 minutes, 30 an hour for everyone.",
  d1a: "Answered by D1A: the router kept it (small).",
  large: (m: string) => `Answered by the large model, ${m}: the router forwarded it.`,
  fallback: "The large model was busy or could not be reached, so D1A answered in its place.",
  noAnswer: "No answer came back.",
  notShown: "This prompt took another route; the demo shows no answer for it.",
  client: (s: number) => `This demo allows 5 sends per visitor every 10 minutes: try again in ${s} s.`,
  everyone: (s: number) => `This hour's sends for everyone are used up: try again in ${s} s.`,
  busy: "Another send is running: try again in a few seconds.",
  seconds: (ms: number) => `${(ms / 1000).toFixed(1)} s`,
};
const TEXT = {
  en: EN,
  ja: {
    send: "送信する", sending: "送信中",
    title: "ルーター経由で送信",
    intro: (m: string) => `「送信する」は実際のルーターに送ります。D1A は簡単なプロンプトを自分で答え、それ以外を大きいモデル（ここでは ${m}）に転送します。上の「D1A の選択」は最も確からしい段階で、ルーターはきわどい判定を1段上に送るため、両者が違うことがあります。`,
    limits: "2,000 文字まで。プルリクエストのリンク、#番号、コードブロックは送れません。1 人 10 分に 5 回、全員で 1 時間 30 回まで。",
    d1a: "D1A が回答: ルーターは転送しませんでした（small）。",
    large: (m: string) => `大きいモデル ${m} が回答: ルーターが転送しました。`,
    fallback: "大きいモデルが混んでいるか接続できなかったため、代わりに D1A が回答しました。",
    noAnswer: "回答が返ってきませんでした。",
    notShown: "このプロンプトは別のルートに送られたため、このデモでは回答を表示しません。",
    client: (s: number) => `このデモは 1 人 10 分に 5 回までです。${s} 秒後にもう一度お試しください。`,
    everyone: (s: number) => `この 1 時間の全員分の送信回数を使い切りました。${s} 秒後にもう一度お試しください。`,
    busy: "別の送信が実行中です。数秒後にもう一度お試しください。",
    seconds: (ms: number) => `${(ms / 1000).toFixed(1)} 秒`,
  },
} satisfies Record<string, typeof EN>;

export function RouteSend({ prompt }: { prompt: string }) {
  const t = useText(TEXT);
  const [status, setStatus] = useState<Status | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sentFor = useRef("");

  useEffect(() => {
    fetch(`${BASE_PATH}/api/route-chat`, { cache: "no-store" }).then((r) => r.json()).then(setStatus).catch(() => setStatus({ on: false }));
  }, []);
  useEffect(() => { if (prompt !== sentFor.current) { setReply(null); setFailure(null); } }, [prompt]);
  if (!status?.on || !status.large) return null;

  async function send() {
    setBusy(true); setReply(null); setFailure(null); sentFor.current = prompt;
    try {
      const r = await fetch(`${BASE_PATH}/api/route-chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const j = await r.json() as Reply & Failure;
      if (r.ok) setReply(j);
      else if (r.status === 429) setFailure(j.error === "client" ? t.client(j.retryAfterS ?? 60) : j.error === "everyone" ? t.everyone(j.retryAfterS ?? 60) : t.busy);
      else setFailure(j.error ?? `HTTP ${r.status}`);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-[12px] leading-5 text-muted-foreground">{t.intro(status.large)}</p>
      <button type="button" className={accentButton} onClick={send} disabled={busy || !prompt.trim()}>{busy ? t.sending : t.send}</button>
      <p className="text-[11px] leading-4 text-muted-foreground">{t.limits}</p>
      {failure && <p role="alert" className="text-[12px] text-destructive">{failure}</p>}
      {reply && (
        <ResultCard title={<>{t.title}{reply.ms !== undefined ? <> · {t.seconds(reply.ms)}</> : null}</>}>
          <p className="text-[13px] font-medium">
            {reply.who === "large" ? t.large(reply.model ?? status.large) : reply.who === "d1a" && reply.note !== "fallback" ? t.d1a : null}
          </p>
          {reply.note === "fallback" && <p className="text-[12px] leading-5">{t.fallback}</p>}
          {reply.note === "no-answer" && <p className="text-[12px] leading-5 text-muted-foreground">{t.noAnswer}</p>}
          {reply.note === "not-shown" && <p className="text-[12px] leading-5 text-muted-foreground">{t.notShown}</p>}
          {reply.answer && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[12px] leading-5">{reply.answer}</pre>}
        </ResultCard>
      )}
    </div>
  );
}
