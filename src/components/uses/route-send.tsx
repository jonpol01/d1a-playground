"use client";

import { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/d1a";
import { useText } from "@/lib/i18n";
import { differs, outcome, type Outcome } from "@/lib/route-chat";
import { ResultCard } from "@/components/uses/shared";

// The routing demo's Ask, its chat half (POST /api/route-chat, src/lib/route-chat.ts): one chat call through the model
// server's real chat routes, the call an app makes. D1A answers the prompt itself or forwards it to the large model on its own,
// and the page learns which only from the reply. Sent only where the playground runs the demo (ROUTE_DEMO=1) and the model
// server routes to a large model; elsewhere, and when a prompt or a limit stops it, the page says no answer was sent.

type Status = { on: boolean; large?: string | null };
export type Chat = { phase: "idle" } | { phase: "waiting" } | Outcome;

const EN = {
  intro: "This is one chat call, the same an app makes: D1A answers easy prompts itself and forwards harder ones to the large model on its own; the answer comes back in the same reply.",
  limits: "Up to 2,000 characters; no pull-request links, #numbers or code blocks. Each visitor: 20 sends per 10 minutes, at most 5 of them forwarded or failed (a prompt D1A answers itself does not count; when the 5 are used up, Ask waits until they come back). Everyone together: 120 sends an hour, at most 30 forwarded or failed.",
  title: "The chat call",
  deciding: "D1A is deciding…",
  d1a: "D1A answered this itself (not forwarded).",
  large: (m: string) => `D1A forwarded this to ${m} automatically — answer below.`,
  fallback: "The large model was busy or could not be reached, so D1A answered in its place.",
  noAnswer: "No answer came back.",
  notShown: "This prompt took another route; the demo shows no answer for it.",
  up: (tier: string) => `D1A's top pick was ${tier}, but the router sends close calls up a tier, so it forwarded this one.`,
  down: (tier: string) => `The route differs from D1A's top pick (${tier}): the router decides from all three probabilities.`,
  notSent: "No answer sent: ",
  failed: "No answer came back: ",
  off: "this playground sends no chats through a router (its routing demo is off, or its model server has no large model).",
  trap: "this demo does not send pull-request links, #numbers or code blocks.",
  long: "the prompt is longer than 2,000 characters.",
  client: (s: number) => `this visitor's 5 forwarded or failed sends are used up for now: try again in ${s} s.`,
  everyone: (s: number) => `this hour's 30 forwarded or failed sends are used up for everyone: try again in ${s} s.`,
  clientAll: (s: number) => `this visitor's 20 sends per 10 minutes are used up: try again in ${s} s.`,
  everyoneAll: (s: number) => `this hour's 120 sends for everyone are used up: try again in ${s} s.`,
  busy: "another send is running: try again in a few seconds.",
  seconds: (ms: number) => `${(ms / 1000).toFixed(1)} s`,
};
const TEXT = {
  en: EN,
  ja: {
    intro: "これはアプリが送るのと同じ、1 回のチャット呼び出しです。D1A は簡単なプロンプトには自分で答え、難しいものは自分の判断で大きいモデルに転送します。答えは同じ応答で返ってきます。",
    limits: "2,000 文字まで。プルリクエストのリンク、#番号、コードブロックは送れません。1 人 10 分に 20 回まで、そのうち転送されたか失敗したものは 5 回まで（D1A が自分で答えたものは数えません。5 回に達すると、戻るまで送信できません）。全員で 1 時間 120 回まで、そのうち転送されたか失敗したものは 30 回まで。",
    title: "チャット呼び出し",
    deciding: "D1A が判断中…",
    d1a: "D1A が自分で答えました（転送なし）。",
    large: (m: string) => `D1A がこのプロンプトを自動で ${m} に転送しました。答えは下にあります。`,
    fallback: "大きいモデルが混んでいるか接続できなかったため、代わりに D1A が回答しました。",
    noAnswer: "回答が返ってきませんでした。",
    notShown: "このプロンプトは別のルートに送られたため、このデモでは回答を表示しません。",
    up: (tier: string) => `D1A の第一候補は ${tier} でしたが、ルーターはきわどい判定を1段上に送るため、このプロンプトを転送しました。`,
    down: (tier: string) => `実際のルートは D1A の第一候補（${tier}）と違います。ルーターは 3 つの確率すべてから判断します。`,
    notSent: "チャットは送信していません: ",
    failed: "回答が返ってきませんでした: ",
    off: "このプレイグラウンドはチャットをルーターに送りません（振り分けデモがオフか、モデルサーバーに大きいモデルがありません）。",
    trap: "このデモはプルリクエストのリンク、#番号、コードブロックを送りません。",
    long: "プロンプトが 2,000 文字を超えています。",
    client: (s: number) => `転送されたか失敗した送信の上限（1 人 10 分に 5 回）に達しました。${s} 秒後にもう一度お試しください。`,
    everyone: (s: number) => `この 1 時間の、転送されたか失敗した送信の上限（全員で 30 回）に達しました。${s} 秒後にもう一度お試しください。`,
    clientAll: (s: number) => `送信の上限（1 人 10 分に 20 回）に達しました。${s} 秒後にもう一度お試しください。`,
    everyoneAll: (s: number) => `この 1 時間の全員分の送信（120 回）を使い切りました。${s} 秒後にもう一度お試しください。`,
    busy: "別の送信が実行中です。数秒後にもう一度お試しください。",
    seconds: (ms: number) => `${(ms / 1000).toFixed(1)} 秒`,
  },
} satisfies Record<string, typeof EN>;

type Known = Status & { failed?: boolean };
const readStatus = (): Promise<Known> => fetch(`${BASE_PATH}/api/route-chat`, { cache: "no-store" }).then((r) => r.json() as Promise<Known>).catch((): Known => ({ on: false, failed: true }));

/** The chat half of Ask: whether this playground sends chats, the latest call's state, and send/reset. `pending` stays true
 * until a sent chat settles, even after a reset: the call still holds its slot on the server until then. */
export function useRouteChat() {
  const [status, setStatus] = useState<Known | null>(null);
  const [chat, setChat] = useState<Chat>({ phase: "idle" });
  const [pending, setPending] = useState(false);
  const known = useRef<Promise<Known> | null>(null);
  const seq = useRef(0);   // a newer send (or a reset) wins over an older reply still in flight

  useEffect(() => {
    const p = readStatus();
    known.current = p;
    p.then(setStatus);
  }, []);

  async function send(prompt: string) {
    const id = ++seq.current;
    setChat({ phase: "waiting" });
    let st = await (known.current ?? readStatus());
    if (st.failed) { known.current = readStatus(); st = await known.current; setStatus(st); }   // one retry after a failed read
    if (id !== seq.current) return;
    if (!st.on || !st.large) { setChat({ phase: "not-sent", why: "off" }); return; }
    let next: Chat;
    setPending(true);
    try {
      const r = await fetch(`${BASE_PATH}/api/route-chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      next = outcome(r.status, await r.json().catch(() => null), prompt.trim());
    } catch (e) {
      next = { phase: "failed", detail: (e as Error).message };
    } finally {
      setPending(false);
    }
    if (id === seq.current) setChat(next);
  }

  function reset() { seq.current++; setChat({ phase: "idle" }); }

  return { status, chat, send, reset, pending, on: Boolean(status?.on && status.large) };
}

/** The intro and the limits, under Ask, where this playground sends chats. */
export function RouteIntro({ on }: { on: boolean }) {
  const t = useText(TEXT);
  if (!on) return null;
  return (
    <div className="space-y-1">
      <p className="text-[12px] leading-5 text-muted-foreground">{t.intro}</p>
      <p className="text-[11px] leading-4 text-muted-foreground">{t.limits}</p>
    </div>
  );
}

/** The headline: the route the reply took, never one guessed from the pick, and the answer. */
export function RouteAnswer({ chat, pick, large }: { chat: Chat; pick: string | null; large: string | null }) {
  const t = useText(TEXT);
  if (chat.phase === "idle") return null;
  const reply = chat.phase === "answered" ? chat.reply : null;
  const why = chat.phase === "not-sent" ? chat : null;
  const wait = why?.retryAfterS ?? 60;
  const reason = !why ? "" : {
    off: t.off, trap: t.trap, long: t.long, invalid: why.detail ?? "", busy: t.busy,
    client: t.client(wait), everyone: t.everyone(wait), "client-all": t.clientAll(wait), "everyone-all": t.everyoneAll(wait),
  }[why.why];
  const headline = chat.phase === "waiting" ? t.deciding
    : reply ? (reply.who === "large" ? t.large(reply.model ?? large ?? "") : reply.who === "d1a" && !reply.note ? t.d1a
      : reply.note === "fallback" ? t.fallback : reply.note === "not-shown" ? t.notShown : t.noAnswer)
    : why ? t.notSent + reason
    : chat.phase === "failed" ? t.failed + chat.detail : "";
  return (
    <ResultCard title={<>{t.title}{reply?.ms !== undefined ? <> · {t.seconds(reply.ms)}</> : null}</>}>
      <p role="status" aria-live="polite" className={`text-[13px] ${reply && (reply.who !== "none") ? "font-medium" : "text-muted-foreground"}`}>{headline}</p>
      {reply && pick && differs(pick, reply) && <p className="mt-1 text-[12px] leading-5">{differs(pick, reply) === "up" ? t.up(pick) : t.down(pick)}</p>}
      {reply?.answer && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[12px] leading-5">{reply.answer}</pre>}
    </ResultCard>
  );
}
