"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "@/lib/d1a";
import { Button } from "@/components/ui/button";
import { Archive, Clock, Reply } from "lucide-react";
import { accentButton, ask, DemoGrid, Empty, ErrorNote, Field, inputCls, pool, textareaCls } from "@/components/uses/shared";
import { Confetti, CountUp, ProgressRing } from "@/components/uses/visuals";
import { useText, type Lang } from "@/lib/i18n";

/** A batch run: one Kev request per item, a few in flight at once, results filled in as they arrive. */
function useBatch<R>() {
  const [results, setResults] = useState<(R | null)[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);   // leaving the tab stops the batch

  async function start<T>(items: T[], concurrency: number, one: (item: T) => Promise<R>) {
    cancelled.current = false;
    setResults(items.map(() => null)); setError(null); setRunning(true); setElapsed(0);
    const t0 = performance.now();
    try {
      await pool(items, concurrency, async (item, i) => {
        const r = await one(item);
        if (cancelled.current) return;
        setResults((prev) => { const next = prev.slice(); next[i] = r; return next; });
        setElapsed((performance.now() - t0) / 1000);
      }, () => cancelled.current);
    } catch (e) {
      cancelled.current = true;
      setError(e);
    } finally {
      setElapsed((performance.now() - t0) / 1000);
      setRunning(false);
    }
  }
  function stop() { cancelled.current = true; }
  function clear() { cancelled.current = true; setResults([]); setError(null); setElapsed(0); }
  const done = results.filter((r) => r !== null).length;
  return { results, error, running, elapsed, done, start, stop, clear };
}

function Throughput({ done, total, elapsed, unit }: { done: number; total: number; elapsed: number; unit: string }) {
  return (
    <p className="text-[13px] tabular-nums text-muted-foreground">
      {done} / {total} {unit} · {elapsed.toFixed(1)} s · <span className="font-medium text-foreground">{elapsed > 0 ? (done / elapsed).toFixed(1) : "0.0"} {unit}/s</span>
    </p>
  );
}

function Concurrency({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled: boolean }) {
  const label = useText({ en: "in flight", ja: "同時リクエスト数" });
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
      {label}
      <select value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="h-8 rounded-md border border-input bg-transparent px-2 text-foreground">
        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

export const splitBlocks = (s: string) => s.split(/\n\s*---\s*\n|\n\s*\n\s*\n/).map((b) => b.trim()).filter(Boolean);

/* ---------------------------------------------------------------- 4. Inbox triage */

// Two questions per email, one request: the three-way triage and a yes/no on urgency. The prototype checkpoint is
// much better at the yes/no, so the urgency answer can promote an email to reply_now. The questions stay English in
// both languages: with Japanese wording the manager's deadline mail fell just under the urgency line.
export const splitPassages = (s: string) => s.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
export const splitLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
export const TRIAGE_Q: Record<string, Question> = {
  triage: {
    type: "choice",
    instructions: "What should I do with this email?",
    criteria: {
      archive: "Nothing: it is a newsletter, notification, receipt or ad",
      later: "Read it this week: not urgent",
      reply_now: "Reply today: urgent, someone is blocked or waiting",
    },
  },
  urgent: { type: "noul", instructions: "Is this email urgent, needing my reply today?" },
};
const EMAILS_EN = `From: Priya (my manager)
Subject: Board deck numbers?
Can you send me the Q3 churn numbers before 3pm? The board deck goes out tonight and that slide is still empty.
---
From: GitHub
Subject: [acme/api] Dependabot: bump lodash from 4.17.20 to 4.17.21
Dependabot opened a pull request to bump lodash. No action is required unless you want to review it.
---
From: Weekly Frontend Digest
Subject: 12 CSS tricks you didn't know
This week: container queries in practice, :has() recipes, and a deep dive into subgrid. Unsubscribe any time.
---
From: Marco (customer, Enterprise plan)
Subject: Production is down after your update
Since your 10:00 deploy every API call from our app returns 502. We have 4,000 users locked out right now. Please call me.
---
From: Lena
Subject: Coffee sometime next month?
Hey! It's been ages. No rush at all, but would you be up for coffee sometime next month to catch up?
---
From: Stripe
Subject: Your receipt from Acme Hosting
Receipt #2291-0045. Amount paid: $49.00. Payment method: Visa ending 4242. Thank you for your business.
---
From: HR
Subject: Please complete the annual security training by Friday
Reminder: the 30-minute security awareness course is due by the end of next week. Link inside.
---
From: Airline Deals
Subject: Flash sale: 40% off flights to Lisbon
Only 48 hours left! Book now and save on flights to Lisbon, Porto and Madeira.`;

const INBOX_EN = {
  emails: EMAILS_EN, unit: "emails",
  field: "Inbox", hint: "emails separated by a line with ---", run: "Sort my inbox", busy: "Sorting", stop: "Stop",
  how: <>Each email is its own request (state = the email), two in flight at a time. Each request asks two questions: the three-way triage and &ldquo;is this urgent, needing a reply today?&rdquo;. An email goes to reply_now when either says so.</>,
  trays: { reply_now: "Reply now", later: "Later", archive: "Archive" } as Record<string, string>,
  emptyTray: "empty",
  cardNote: "Each card shows the probability of its tray (for reply now, the higher of the triage and urgency answers); hover a card for every probability.",
  empty: "Sort the inbox to see every email labelled and ordered: reply now first, most certain at the top.",
};
export const INBOX_TEXT: Record<Lang, typeof INBOX_EN> = {
  en: INBOX_EN,
  ja: {
    emails: `From: 佐藤部長
Subject: 【至急】取締役会資料の数字を今日中に
今日の15時までに第3四半期の解約率の数字を送ってください。取締役会の資料は今夜送付で、そのスライドがまだ空欄のままです。返信待っています。
---
From: GitHub
Subject: [acme/api] Dependabot: lodash を 4.17.20 から 4.17.21 に更新
Dependabot が lodash を更新するプルリクエストを作成しました。確認したい場合を除き、対応は不要です。
---
From: 週刊フロントエンド・ダイジェスト
Subject: 知らなかった CSS テクニック12選
今週の内容: コンテナクエリの実践、:has() のレシピ、subgrid の徹底解説。配信停止はいつでもできます。
---
From: 高橋さん（お客様・Enterprise プラン）
Subject: 御社のアップデート後に本番環境が停止しています
10時のデプロイ以降、弊社アプリからの API 呼び出しがすべて 502 を返しています。現在 4,000 人のユーザーがログインできません。至急お電話ください。
---
From: 美咲
Subject: 来月あたりお茶でもどう？
久しぶり！急がないけど、来月あたりにお茶でもしながら近況を話さない？
---
From: Stripe
Subject: Acme Hosting からの領収書
領収書番号 2291-0045。お支払い金額: 4,900円。お支払い方法: Visa（末尾 4242）。ご利用ありがとうございます。
---
From: 人事部
Subject: 年次セキュリティ研修を来週金曜日までに受講してください
リマインダー: 30分のセキュリティ意識向上コースの受講期限は来週末です。リンクは本文にあります。
---
From: 航空券セール情報
Subject: タイムセール: リスボン行き航空券が40%オフ
残り48時間！今すぐ予約して、リスボン、ポルト、マデイラ行きの航空券をお得に。`, unit: "通",
    field: "受信トレイ", hint: "メールは --- だけの行で区切ります", run: "受信トレイを仕分ける", busy: "仕分け中", stop: "停止",
    how: <>メール1通ごとに1リクエスト（state = そのメール）で、同時に2件ずつ送ります。各リクエストでは2つの質問をします。3択の仕分けと「今日中に返信が必要な急ぎのメールか？」です。どちらかが急ぎと答えたメールは reply_now に入ります。</>,
    trays: { reply_now: "今すぐ返信", later: "あとで", archive: "アーカイブ" },
    emptyTray: "なし",
    cardNote: "各カードの数値はそのトレイの確率です（今すぐ返信は、仕分けと急ぎの答えの高いほう）。カードにカーソルを合わせると、すべての確率が表示されます。",
    empty: "受信トレイを仕分けると、すべてのメールにラベルが付き、今すぐ返信を先頭に、確信度の高い順に並びます。",
  },
};

type Triage = { choice: string; p: number; probs: Record<string, number>; urgent: number; ms: number };
const TRIAGE_ORDER = ["reply_now", "later", "archive"];
const TRAYS = [
  { id: "reply_now", color: "#e11d48", Icon: Reply },
  { id: "later", color: "#d97706", Icon: Clock },
  { id: "archive", color: "#64748b", Icon: Archive },
];

export function InboxDemo() {
  const t = useText(INBOX_TEXT);
  const [text, setText] = useState(t.emails);
  const batch = useBatch<Triage>();
  const [items, setItems] = useState<string[]>([]);
  const [runId, setRunId] = useState(0);

  function run() {
    const emails = splitBlocks(text);
    setItems(emails); setRunId((n) => n + 1);
    batch.start(emails, 2, async (email) => {
      const r = await ask(email, TRIAGE_Q);
      const a = r.answers.triage, u = r.answers.urgent;
      if (a.type !== "choice" || u.type !== "noul") throw new Error("unexpected answer type");
      const choice = u.noul >= 0.5 ? "reply_now" : a.choice;
      return { choice, p: choice === "reply_now" ? Math.max(u.noul, a.probabilities.reply_now) : a.probabilities[a.choice], probs: a.probabilities, urgent: u.noul, ms: r.latency_ms };
    });
  }
  const sorted = items.map((e, i) => ({ e, i, r: batch.results[i] ?? null }))
    .sort((a, b) => {
      if (!a.r || !b.r) return a.r ? -1 : b.r ? 1 : a.i - b.i;
      const g = TRIAGE_ORDER.indexOf(a.r.choice) - TRIAGE_ORDER.indexOf(b.r.choice);
      return g !== 0 ? g : b.r.p - a.r.p;
    });
  const header = (e: string) => {
    const from = /^From:\s*(.*)$/m.exec(e)?.[1] ?? "";
    const subject = /^Subject:\s*(.*)$/m.exec(e)?.[1] ?? e.split("\n")[0];
    return { from, subject };
  };

  return (
    <DemoGrid
      left={<>
        <Field label={t.field} hint={t.hint} htmlFor="inbox">
          <textarea id="inbox" className={`${textareaCls} min-h-[26rem]`} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={batch.running} className={accentButton}>{batch.running ? t.busy : t.run}</Button>
          {batch.running && <Button variant="outline" onClick={batch.stop} className="rounded-md shadow-none">{t.stop}</Button>}
        </div>
        <p className="text-[12px] leading-5 text-muted-foreground">{t.how}</p>
        <ErrorNote error={batch.error} />
      </>}
      right={items.length ? <>
        <div className="flex flex-wrap items-center gap-4">
          <ProgressRing done={batch.done} total={items.length} size={56} />
          <Throughput done={batch.done} total={items.length} elapsed={batch.elapsed} unit={t.unit} />
        </div>
        <div className="relative grid gap-3 sm:grid-cols-3">
          {!batch.running && batch.done === items.length && <Confetti key={runId} />}
          {TRAYS.map((tray) => {
            const inTray = sorted.filter(({ r }) => r?.choice === tray.id);
            return (
              <section key={tray.id} className="flex min-w-0 flex-col gap-2 rounded-2xl border p-2.5" style={{ borderColor: `color-mix(in oklch, ${tray.color} 40%, transparent)`, background: `color-mix(in oklch, ${tray.color} 7%, transparent)` }}>
                <h4 className="flex items-center gap-1.5 px-1 text-[12px] font-semibold" style={{ color: tray.color }}>
                  <tray.Icon className="size-3.5" aria-hidden />{t.trays[tray.id]}<span className="ml-auto rounded-full px-1.5 font-mono text-[11px]" style={{ background: `color-mix(in oklch, ${tray.color} 18%, transparent)` }}>{inTray.length}</span>
                </h4>
                {inTray.map(({ e, i, r }) => {
                  const h = header(e);
                  return (
                    <article key={i} className="pop-in rounded-xl border border-border bg-card px-2.5 py-2 shadow-xs" title={`${h.subject}\n${Object.entries(r!.probs).map(([k, p]) => `${k} ${p.toFixed(2)}`).join(" · ")} · p(urgent) ${r!.urgent.toFixed(2)}`}>
                      <p className="line-clamp-2 text-[12px] font-medium leading-4">{h.subject}</p>
                      <p className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{h.from}</span><span className="shrink-0 font-mono tabular-nums">{r!.p.toFixed(2)}</span>
                      </p>
                    </article>
                  );
                })}
                {!inTray.length && <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">{batch.running ? "…" : t.emptyTray}</p>}
              </section>
            );
          })}
        </div>
        {batch.running && <div className="flex flex-wrap gap-1.5">{sorted.filter(({ r }) => !r).map(({ i }) => <span key={i} className="shimmer h-5 w-16 rounded-full" />)}</div>}
        <p className="text-[12px] leading-5 text-muted-foreground">{t.cardNote}</p>
      </> : <Empty>{t.empty}</Empty>}
    />
  );
}

/* ---------------------------------------------------------------- 5. Reranking */

const RERANK_QUERY_EN = "How do I reset my password if I no longer have access to my email?";
const PASSAGES_EN = `Our password policy requires at least 12 characters, including one number and one symbol. Passwords expire every 180 days.

To change your email address, open Settings, then Account, and enter the new address. We send a confirmation link to both the old and the new address.

If you can't reach the email on your account, use "Recover with phone" on the sign-in page. We text a code to your verified phone number; after entering it you can set a new password and update your email.

Two-factor authentication adds a second step at sign-in. You can use an authenticator app or a hardware security key.

Forgot your password? Click "Forgot password" on the sign-in page and we'll email you a reset link that is valid for 30 minutes.

Still locked out with no access to your email or phone? Contact support with a photo ID; after verifying your identity we reset the password and let you choose a new email address.`;

// For Japanese passages, a Japanese question ranked them better than the English wrapper did (the English one put
// the password-policy passage second), so each language asks in its own words.
const RERANK_EN = {
  query: RERANK_QUERY_EN, passages: PASSAGES_EN, unit: "passages",
  ask: (q: string) => `Does this passage answer the question: "${q}"?`,
  qField: "Query", pField: "Passages", pHint: "first-stage retrieval order, separated by a blank line",
  run: "Rerank", busy: "Reranking",
  how: "One request per passage: the passage is the state, and the query goes into a yes/no question. Sorting by p(yes) gives the new order.",
  rankedFor: (q: string) => <>Reranked for <span className="italic">“{q}”</span></>, scoring: "Scoring…", was: (i: number) => `was #${i}`,
  empty: "Rerank to score every passage with p(answers the query) and see the before and after order.",
};
export const RERANK_TEXT: Record<Lang, typeof RERANK_EN> = {
  en: RERANK_EN,
  ja: {
    query: "メールにアクセスできなくなった場合、パスワードをリセットするにはどうすればよいですか？", passages: `パスワードポリシーでは、数字と記号をそれぞれ1文字以上含む12文字以上が必要です。パスワードは180日ごとに期限切れになります。

メールアドレスを変更するには、「設定」→「アカウント」を開き、新しいアドレスを入力します。確認リンクを古いアドレスと新しいアドレスの両方に送信します。

アカウントのメールにアクセスできない場合は、サインインページの「電話で復旧」を使ってください。確認済みの電話番号にコードを SMS で送ります。コードを入力すると、新しいパスワードを設定してメールアドレスを更新できます。

2要素認証は、サインイン時に2つ目の手順を追加します。認証アプリまたはハードウェアのセキュリティキーを使えます。

パスワードをお忘れですか？サインインページで「パスワードをお忘れの場合」をクリックすると、30分間有効なリセット用リンクをメールでお送りします。

メールにも電話にもアクセスできず、まだログインできない場合は、写真付き身分証明書を添えてサポートにお問い合わせください。本人確認の後、パスワードをリセットし、新しいメールアドレスを選べるようにします。`, unit: "件",
    ask: (q: string) => `この文章は「${q}」という質問への答えになっていますか？`,
    qField: "検索クエリ", pField: "文章", pHint: "一次検索の順番。空行で区切ります",
    run: "並べ替える", busy: "並べ替え中",
    how: "文章1件ごとに1リクエストです。文章が state になり、クエリは yes/no の質問に入ります。p(yes) で並べ替えると新しい順位になります。",
    rankedFor: (q: string) => <><span className="italic">「{q}」</span>で並べ替えました</>, scoring: "採点中…", was: (i: number) => `元は #${i}`,
    empty: "「並べ替える」を押すと、各文章の p(クエリに答えている) を求め、並べ替え前後の順位を表示します。",
  },
};

type Rel = { p: number; ms: number };
const RR_STEP = 72;   // px per row; rows are absolutely placed so a new order animates as a slide

export function RerankDemo() {
  const t = useText(RERANK_TEXT);
  const [query, setQuery] = useState(t.query);
  const [text, setText] = useState(t.passages);
  const [items, setItems] = useState<string[]>([]);
  const [askedQuery, setAskedQuery] = useState("");
  const batch = useBatch<Rel>();

  function run() {
    const passages = splitPassages(text);
    setItems(passages); setAskedQuery(query);
    const q: Record<string, Question> = { answers: { type: "noul", instructions: t.ask(query) } };
    batch.start(passages, 3, async (passage) => {
      const r = await ask(passage, q);
      const a = r.answers.answers;
      if (a.type !== "noul") throw new Error("unexpected answer type");
      return { p: a.noul, ms: r.latency_ms };
    });
  }
  const finished = items.length > 0 && batch.done === items.length;
  const ranked = items.map((s, i) => ({ s, i, r: batch.results[i] ?? null }))
    .sort((a, b) => finished ? b.r!.p - a.r!.p : a.i - b.i);

  return (
    <DemoGrid
      left={<>
        <Field label={t.qField} htmlFor="rr-q"><input id="rr-q" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
        <Field label={t.pField} hint={t.pHint} htmlFor="rr-p">
          <textarea id="rr-p" className={`${textareaCls} min-h-[24rem]`} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={batch.running || !query.trim()} className={accentButton}>{batch.running ? t.busy : t.run}</Button>
        </div>
        <p className="text-[12px] leading-5 text-muted-foreground">{t.how}</p>
        <ErrorNote error={batch.error} />
      </>}
      right={items.length ? <>
        <Throughput done={batch.done} total={items.length} elapsed={batch.elapsed} unit={t.unit} />
        <p className="text-[13px] leading-5">{finished ? t.rankedFor(askedQuery) : t.scoring}</p>
        <ol className="relative" style={{ height: items.length * RR_STEP }}>
          {items.map((txt, i) => {
            const r = batch.results[i] ?? null;
            const newRank = ranked.findIndex((x) => x.i === i);
            const move = finished ? i - newRank : 0;
            return (
              <li key={i} className={`absolute inset-x-0 grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 rounded-xl border px-3 transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${finished && newRank === 0 ? "border-(--demo) bg-(--demo-soft) shadow-md" : "border-border bg-card"}`}
                style={{ height: RR_STEP - 8, transform: `translateY(${(finished ? newRank : i) * RR_STEP}px)` }}>
                <span className="text-[12px] tabular-nums leading-5">
                  <span className="font-heading text-base font-semibold">#{finished ? newRank + 1 : i + 1}</span>
                  {finished && <span className="ml-1 text-muted-foreground">{t.was(i + 1)}</span>}
                  {finished && move !== 0 && <span className={`block text-[11px] ${move > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{move > 0 ? `▲ ${move}` : `▼ ${-move}`}</span>}
                </span>
                <span className="line-clamp-2 text-[12px] leading-5 text-muted-foreground" title={txt}>{txt}</span>
                {r ? (
                  <span className="rounded-full px-2 py-0.5 text-center font-mono text-[12px] font-semibold text-white" style={{ background: `hsl(${Math.round(r.p * 145)} 70% 40%)` }}>{r.p.toFixed(2)}</span>
                ) : <span className="shimmer h-5 rounded-full" />}
              </li>
            );
          })}
        </ol>
      </> : <Empty>{t.empty}</Empty>}
    />
  );
}

/* ---------------------------------------------------------------- 7. Bulk labeling */

const REVIEWS_EN = `Arrived two days early and fits perfectly. Would buy again.
The zipper broke the first time I used it.
It's fine. Does what it says, nothing special.
Battery lasts all day, even with GPS on. Love it.
Colour is a bit darker than in the photos but still nice.
Stopped working after a week and support never replied.
Exactly as described.
Too small, runs at least one size under. Returning it.
Honestly the best headphones I've owned at this price.
Packaging was damaged but the product inside was okay.
Meh. I expected more for the money.
Super comfortable, I wear them every day.
The app keeps crashing when I try to pair the device.
Average quality, average price.
My kids love it and it survived being dropped a dozen times.
Smells strongly of chemicals, could not use it.
Works, but the instructions were only in German.
Great value, sturdy and easy to assemble.
Received the wrong colour. Exchange took three weeks.
Neither good nor bad, it's a phone case.
Gorgeous design and the leather feels premium.
Scratched after two days of normal use.
Delivery was on time. Haven't tried it yet.
The sound quality blew me away.
Cheap plastic, feels like it will break soon.
It's okay for occasional use.
Customer service replaced it immediately when it failed. Impressed.
Doesn't fit my model even though the listing said it would.
Lightweight and does the job.
Total waste of money.`;

export const LABEL_Q: Record<string, Question> = {
  sentiment: { type: "choice", instructions: "What is the sentiment of this product review?", criteria: { positive: "The reviewer is happy with the product or service", neutral: "Mixed, plain or factual, no clear feeling either way", negative: "The reviewer is unhappy with the product or service" } },
};
const BULK_EN = {
  reviews: REVIEWS_EN, unit: "rows",
  edit: (n: number) => `Edit the rows (one review per line, ${n} now)`, editAria: "Reviews, one per line",
  run: "Label all rows", busy: "Labelling", stop: "Stop", perSec: "rows/s",
  low: (n: number) => `${n} with p(label) below 0.60`, lowTail: ", the rows to send to a human reviewer",
  cols: { review: "Review", label: "Label" },
};
export const BULK_TEXT: Record<Lang, typeof BULK_EN> = {
  en: BULK_EN,
  ja: {
    reviews: `予定より2日早く届き、サイズもぴったりでした。また買いたいです。
初めて使ったときにファスナーが壊れました。
普通です。説明どおりに動きますが、特別なところはありません。
GPS をオンにしてもバッテリーが一日もちます。最高です。
写真より少し色が濃いですが、それでも素敵です。
1週間で動かなくなり、サポートからは返事がありませんでした。
説明どおりです。
小さすぎます。少なくとも1サイズ小さめです。返品します。
この価格帯では、今まで使った中で一番のヘッドホンです。
梱包は傷んでいましたが、中の商品は問題ありませんでした。
うーん。値段の割に期待外れでした。
とても履き心地がよく、毎日使っています。
デバイスとペアリングしようとするとアプリが落ち続けます。
品質も価格も平均的です。
子どもたちのお気に入りで、何十回も落としても壊れませんでした。
化学薬品のような強いにおいがして、使えませんでした。
使えますが、説明書がドイツ語しかありませんでした。
コスパが良く、頑丈で組み立ても簡単です。
違う色が届きました。交換に3週間かかりました。
良くも悪くもない、ただのスマホケースです。
デザインが美しく、革の質感も高級です。
普通に使って2日で傷がつきました。
時間どおりに届きました。まだ使っていません。
音質に驚きました。
安っぽいプラスチックで、すぐ壊れそうです。
たまに使う分には問題ありません。
故障したときにカスタマーサービスがすぐ交換してくれました。感心しました。
商品ページでは対応と書いてあったのに、自分の機種に合いません。
軽くて、ちゃんと役目を果たします。
完全にお金の無駄でした。`, unit: "行",
    edit: (n: number) => `行を編集（1行に1件、現在 ${n} 行）`, editAria: "レビュー（1行に1件）",
    run: "すべての行にラベル付け", busy: "ラベル付け中", stop: "停止", perSec: "行/秒",
    low: (n: number) => `p(label) が 0.60 未満の ${n} 行`, lowTail: "は、人が確認すべき行です",
    cols: { review: "レビュー", label: "ラベル" },
  },
};

type Label = { choice: string; p: number };
const LABEL_CHIP: Record<string, string> = {
  positive: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  neutral: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  negative: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

export function BulkDemo() {
  const t = useText(BULK_TEXT);
  const [text, setText] = useState(t.reviews);
  const [concurrency, setConcurrency] = useState(3);
  const [rows, setRows] = useState<string[]>(() => t.reviews.split("\n"));
  const batch = useBatch<Label>();

  function run() {
    const lines = splitLines(text);
    setRows(lines);
    batch.start(lines, concurrency, async (line) => {
      const r = await ask(line, LABEL_Q);
      const a = r.answers.sentiment;
      if (a.type !== "choice") throw new Error("unexpected answer type");
      return { choice: a.choice, p: a.probabilities[a.choice] };
    });
  }
  const counts = batch.results.reduce<Record<string, number>>((c, r) => { if (r) c[r.choice] = (c[r.choice] ?? 0) + 1; return c; }, {});
  const low = batch.results.filter((r) => r && r.p < 0.6).length;

  return (
    <div className="flex flex-col gap-5">
      <details className="text-[13px]">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t.edit(rows.length)}</summary>
        <textarea aria-label={t.editAria} className={`${textareaCls} mt-2 min-h-60`} value={text} onChange={(e) => setText(e.target.value)} />
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={batch.running} className={accentButton}>{batch.running ? t.busy : t.run}</Button>
        {batch.running && <Button variant="outline" onClick={batch.stop} className="rounded-md shadow-none">{t.stop}</Button>}
        <Concurrency value={concurrency} onChange={setConcurrency} disabled={batch.running} />
      </div>
      {batch.results.length > 0 && (
        <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-(--demo-line) bg-(--demo-soft) p-4">
          <ProgressRing done={batch.done} total={batch.results.length} />
          <div>
            <p className="font-heading text-3xl font-semibold tracking-tight"><CountUp value={batch.elapsed > 0 ? batch.done / batch.elapsed : 0} format={(v) => v.toFixed(1)} ms={300} /> <span className="text-base font-normal text-muted-foreground">{t.perSec}</span></p>
            <Throughput done={batch.done} total={batch.results.length} elapsed={batch.elapsed} unit={t.unit} />
          </div>
          <div className="flex flex-wrap gap-2">
            {["positive", "neutral", "negative"].map((k) => (
              <span key={k} className={`rounded-full px-3 py-1 font-mono text-[12px] ${LABEL_CHIP[k]}`}>{k} {counts[k] ?? 0}</span>
            ))}
          </div>
        </div>
      )}
      {batch.done > 0 && (
        <p className="text-[13px] tabular-nums text-muted-foreground">
          {Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(" · ")} · <span className="text-foreground">{t.low(low)}</span>{t.lowTail}
        </p>
      )}
      <ErrorNote error={batch.error} />
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th scope="col" className="w-10 px-3 py-2 font-normal">#</th>
              <th scope="col" className="px-3 py-2 font-normal">{t.cols.review}</th>
              <th scope="col" className="w-24 px-3 py-2 font-normal">{t.cols.label}</th>
              <th scope="col" className="w-40 px-3 py-2 font-normal">p(label)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const r = batch.results[i] ?? null;
              return (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5">{row}</td>
                  <td className="px-3 py-1.5">{r ? <span className={`pop-in inline-block rounded-full px-2 py-0.5 font-mono text-[11px] ${LABEL_CHIP[r.choice] ?? ""}`}>{r.choice}</span> : batch.running ? <span className="shimmer inline-block h-4 w-14 rounded-full" /> : ""}</td>
                  <td className="px-3 py-1.5">
                    {r && (
                      <span className="flex items-center gap-2">
                        <span className="relative block h-1 w-20 rounded-full bg-muted" aria-hidden>
                          <span className={`absolute inset-y-0 left-0 rounded-full ${r.p < 0.6 ? "bg-amber-500" : "bg-foreground"}`} style={{ width: `${Math.round(r.p * 100)}%` }} />
                        </span>
                        <span className="tabular-nums">{r.p.toFixed(2)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
