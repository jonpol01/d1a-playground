"use client";

import { useEffect, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, Gamepad2, Mic, Gauge, Inbox, ListOrdered, Route, ShieldCheck, Star, Tags, Wrench, type LucideIcon } from "lucide-react";
import { api, START_HINT } from "@/lib/kev";
import { LANGS, setLang, useHtmlLang, useLang, useText, type Lang } from "@/lib/i18n";
import { HwMonitor, type ModelMeta } from "@/components/hw-monitor";
import { BulkDemo, InboxDemo, RerankDemo } from "@/components/uses/batch";
import { ControlDemo } from "@/components/uses/control";
import { PhotoDemo, VoiceDemo } from "@/components/uses/media";
import { EvalsDemo, GateDemo, GuardrailsDemo, RoutingDemo, ToolGateDemo } from "@/components/uses/single";

type Demo = { id: string; accent: string; Icon: LucideIcon; outcomes: string[]; Component: ComponentType };
type DemoText = { title: string; caption: string; line: string; input: string };

const DEMOS: Demo[] = [
  { id: "routing", accent: "#7c3aed", Icon: Route, outcomes: ["small", "medium", "large"], Component: RoutingDemo },
  { id: "guardrails", accent: "#059669", Icon: ShieldCheck, outcomes: ["allow", "block"], Component: GuardrailsDemo },
  { id: "tools", accent: "#d97706", Icon: Wrench, outcomes: ["allow", "ask", "deny"], Component: ToolGateDemo },
  { id: "inbox", accent: "#0284c7", Icon: Inbox, outcomes: ["reply now", "later", "archive"], Component: InboxDemo },
  { id: "rerank", accent: "#c026d3", Icon: ListOrdered, outcomes: ["p(relevant)"], Component: RerankDemo },
  { id: "evals", accent: "#ea580c", Icon: Star, outcomes: ["1", "2", "3", "4", "5"], Component: EvalsDemo },
  { id: "labeling", accent: "#0d9488", Icon: Tags, outcomes: ["positive", "neutral", "negative"], Component: BulkDemo },
  { id: "control", accent: "#e11d48", Icon: Gamepad2, outcomes: ["left", "stay", "right"], Component: ControlDemo },
  { id: "gate", accent: "#4f46e5", Icon: Gauge, outcomes: ["act", "confirm", "human"], Component: GateDemo },
  { id: "photo", accent: "#0891b2", Icon: Camera, outcomes: ["damaged?", "where?"], Component: PhotoDemo },
  { id: "voice", accent: "#be185d", Icon: Mic, outcomes: ["urgent?", "intent"], Component: VoiceDemo },
];

const DEMO_TEXT: Record<Lang, Record<string, DemoText>> = {
  en: {
    routing: { title: "Model routing", input: "prompt", caption: "Send each prompt to the cheapest model that can handle it.",
      line: "The model reads the user's prompt and rates how hard it is, which picks the model tier; the probabilities show when a call is close enough to send up a tier." },
    guardrails: { title: "Guardrails", input: "message", caption: "Stop prompt injection and abuse before they reach the LLM.",
      line: "The model labels an incoming message and says whether it should reach the LLM at all; a probability lets you block only when the model is sure and log the rest." },
    tools: { title: "Tool-call gating", input: "tool call", caption: "Decide which agent actions run, need a human, or never happen.",
      line: "The model reads an agent's proposed tool call and decides allow, ask or deny against a written policy; p(deny) is the number to alert on." },
    inbox: { title: "Inbox triage", input: "email", caption: "Sort a pile of email into what needs you today.",
      line: "The model reads each email and decides reply now, later or archive; the probability orders the inbox so the most certain urgent mail is on top." },
    rerank: { title: "Reranking", input: "passage + query", caption: "Re-order search results by whether they answer the question.",
      line: "The model reads each retrieved passage and answers whether it answers the query; p(yes) is a relevance score you can sort by and cut off." },
    evals: { title: "LLM evals", input: "Q + answer", caption: "Grade LLM answers with a score and a spread, not a guess.",
      line: "The model grades an LLM answer from 1 to 5; the expected grade and its spread tell a confident 3 from a coin toss between 1 and 5." },
    labeling: { title: "Bulk labeling", input: "table row", caption: "Label a whole table and flag the rows a human should check.",
      line: "The model labels every row of a table; the p(label) column tells you which rows a human should look at." },
    control: { title: "Real-time control", input: "world state", caption: "Steer a robot with one fast decision per tick.",
      line: "The model reads a text description of the world every tick and picks the next move; each decision is one short forward pass." },
    gate: { title: "Confidence gate", input: "any text", caption: "Act when sure, confirm when unsure, escalate otherwise.",
      line: "The model answers one question with a calibrated probability, and your thresholds decide whether to act, act and confirm, or ask a human." },
    photo: { title: "Photo check", input: "photo", caption: "Check a delivery photo for damage and where the parcel was left.",
      line: "The model looks at a proof-of-delivery photo and answers typed questions about it: is the parcel damaged, and where was it left. Gemma 4's own vision encoder reads the photo; there is no captioning step." },
    voice: { title: "Voice triage", input: "voice note", caption: "Hear what a driver's voice note needs and whether it is urgent.",
      line: "The model listens to a short voice note, in English or Japanese, and decides what the speaker needs and whether it is urgent. Gemma 4's own audio encoder reads the sound; there is no speech-to-text step." },
  },
  ja: {
    routing: { title: "モデルの振り分け", input: "プロンプト", caption: "各プロンプトを、処理できる一番安いモデルに送ります。",
      line: "モデルがユーザーのプロンプトを読んで難しさを判定し、送り先のモデルの段階を決めます。確率を見れば、1段上に送るべききわどい判定かどうかが分かります。" },
    guardrails: { title: "ガードレール", input: "メッセージ", caption: "プロンプトインジェクションや暴言を、LLM に届く前に止めます。",
      line: "モデルが受信メッセージを分類し、そもそも LLM に渡すべきかを答えます。確率があるので、確信が高いときだけブロックし、それ以外は記録に回せます。" },
    tools: { title: "ツール呼び出しの制御", input: "ツール呼び出し", caption: "エージェントの操作を、実行する・人に確認する・実行しない、に分けます。",
      line: "モデルがエージェントの提案したツール呼び出しを読み、書かれたポリシーに照らして allow / ask / deny を決めます。アラートの基準にするのは p(deny) です。" },
    inbox: { title: "受信トレイの仕分け", input: "メール", caption: "たまったメールから、今日対応すべきものを選び出します。",
      line: "モデルが各メールを読み、今すぐ返信・あとで・アーカイブを決めます。確率で並べるので、確実に急ぎのメールが一番上に来ます。" },
    rerank: { title: "リランキング", input: "文章 + クエリ", caption: "検索結果を、質問に答えているかどうかで並べ直します。",
      line: "モデルが検索で取ってきた各文章を読み、クエリに答えているかを答えます。p(yes) はそのまま並べ替えや足切りに使える関連度スコアです。" },
    evals: { title: "LLM の評価", input: "質問 + 回答", caption: "LLM の回答を、当て推量ではなくスコアと分布で採点します。",
      line: "モデルが LLM の回答を1〜5で採点します。期待値と分布を見れば、自信のある 3 と、1 か 5 かの五分五分を見分けられます。" },
    labeling: { title: "一括ラベル付け", input: "表の行", caption: "表全体にラベルを付け、人が確認すべき行を示します。",
      line: "モデルが表のすべての行にラベルを付けます。p(label) の列を見れば、人が確認すべき行が分かります。" },
    control: { title: "リアルタイム制御", input: "世界の状態", caption: "1ティックに1回の高速な判断でロボットを動かします。",
      line: "モデルが毎ティック、世界をテキストで表した状態を読み、次の動きを選びます。1回の判断は短い順伝播1回だけです。" },
    gate: { title: "確信度ゲート", input: "任意のテキスト", caption: "確かなら実行、迷うなら確認、それ以外は人に回します。",
      line: "モデルが1つの質問に較正済みの確率で答え、実行する・実行して確認する・人に回すのどれにするかは、あなたのしきい値が決めます。" },
    photo: { title: "写真チェック", input: "写真", caption: "配達写真から、荷物の破損と置き場所を確認します。",
      line: "モデルが配達完了の写真を見て、型付きの質問に答えます。荷物は破損しているか、どこに置かれたか。写真は Gemma 4 自身の画像エンコーダーが読み、キャプション生成の段階はありません。" },
    voice: { title: "音声トリアージ", input: "音声メモ", caption: "ドライバーの音声メモから、用件と緊急かどうかを聞き取ります。",
      line: "モデルが英語または日本語の短い音声メモを聞き、話し手の用件と緊急かどうかを判定します。音声は Gemma 4 自身の音声エンコーダーが読み、文字起こしの段階はありません。" },
  },
};

const UI_EN = {
  heroA: "Eleven jobs for a ", heroB: "small decision model", heroC: ".",
  heroSub: "One document and a few typed questions in, a calibrated probability for every option out, in well under a second. Pick a use case: every example is live and editable, and two of them read a photo or a voice note.",
  down: "The model server is not answering on port 8009, so the demos cannot run.",
  lmstudio: "LM Studio mode: answers come from a prompted chat model, not the trained checkpoint. Probabilities are the chat model's letter probabilities, uncalibrated.",
  all: "All", useCases: "Use cases", architecture: "Architecture", language: "Language",
  pill: { connecting: "connecting to the model server…", down: "model server not reachable", lm: "LM Studio mode", up: "server connected" },
  englishNote: "",
};
const UI: Record<Lang, typeof UI_EN> = {
  en: UI_EN,
  ja: {
    heroA: "", heroB: "小さな判断モデル", heroC: "に任せる11の仕事",
    heroSub: "1つの文書といくつかの型付きの質問を入れると、すべての選択肢に較正済みの確率が返ってきます。1秒もかかりません。ユースケースを選んでください。どの例もライブで動き、自由に編集できます。うち2つは写真や音声メモを読み取ります。",
    down: "モデルサーバー（ポート 8009）が応答しないため、デモを実行できません。",
    lmstudio: "LM Studio モード: 答えは学習済みのチェックポイントではなく、プロンプトで指示したチャットモデルから返っています。確率はチャットモデルの選択肢記号の確率で、較正されていません。",
    all: "一覧", useCases: "ユースケース", architecture: "アーキテクチャ", language: "言語",
    pill: { connecting: "モデルサーバーに接続中…", down: "モデルサーバーに接続できません", lm: "LM Studio モード", up: "サーバー接続済み" },
    englishNote: "※ プロトタイプのモデルは英語のデータで学習しています。日本語の例文でも動きますが、答えを安定させるため、質問文と選択肢の説明を英語のまま送っているデモがあります。",
  },
};

// The selected demo lives in the URL hash (#routing, #guardrails, ...) so a demo can be linked to directly; no hash = the overview.
function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const getHash = () => window.location.hash.slice(1);
const getServerHash = () => "";

type ModelInfo = ModelMeta | { error: string } | null;
// Accent-coloured text, lifted toward white in dark mode so it keeps its contrast on dark cards.
const ACCENT_TEXT = "text-(--demo) dark:text-[color-mix(in_oklch,var(--demo)_60%,white)]";
const accentStyle = (accent: string) => ({ "--demo": accent } as CSSProperties);

function StatusPill({ model }: { model: ModelInfo }) {
  const t = useText(UI).pill;
  const state = model === null ? "wait" : "error" in model ? "down" : model.backend === "lmstudio" ? "lm" : "up";
  const dot = { wait: "bg-slate-400", down: "bg-rose-500", lm: "bg-amber-500", up: "bg-emerald-500" }[state];
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-[12px] shadow-xs backdrop-blur">
      <span className="relative flex size-2 shrink-0">
        {state === "up" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${dot}`} />
      </span>
      <span className="truncate">
        {model === null ? t.connecting : "error" in model ? t.down : (
          <>{state === "lm" ? t.lm : t.up} · <span className="font-mono">{model.run}</span> · <span className="font-mono">{model.base}</span>{model.device ? <> · {model.device}</> : null}</>
        )}
      </span>
    </span>
  );
}

/** JA | EN segmented switch. */
export function LangSwitch() {
  const lang = useLang();
  const t = useText(UI);
  return (
    <div role="group" aria-label={t.language} className="inline-flex rounded-full border border-border bg-background/70 p-0.5 text-[12px] shadow-xs backdrop-blur">
      {LANGS.map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={l === lang} lang={l}
          className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${l === lang ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
          {l === "ja" ? "JA" : "EN"}
        </button>
      ))}
    </div>
  );
}

function MiniFlow({ d, input }: { d: Demo; input: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]" aria-hidden>
      <span className="shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 text-muted-foreground">{input}</span>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
      <span className="shrink-0 rounded-md px-1.5 py-0.5 font-heading font-bold text-white" style={{ background: d.accent }}>D1A</span>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-wrap gap-1">
        {d.outcomes.map((o) => <span key={o} className={`rounded-md bg-(--demo-soft) px-1.5 py-0.5 font-mono ${ACCENT_TEXT}`}>{o}</span>)}
      </span>
    </div>
  );
}

function DemoCard({ d, n, text }: { d: Demo; n: number; text: DemoText }) {
  return (
    <a href={`#${d.id}`} onClick={() => window.scrollTo({ top: 0 })} style={accentStyle(d.accent)}
      className="demo-accent group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-(--demo-line) hover:shadow-xl focus-visible:ring-[3px] focus-visible:ring-(--demo-line) focus-visible:outline-none">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: d.accent }} aria-hidden />
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-(--demo-soft) ${ACCENT_TEXT}`}><d.Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground">{String(n).padStart(2, "0")}</p>
          <h3 className="font-heading text-lg leading-tight font-semibold tracking-tight">{text.title}</h3>
        </div>
        <ArrowRight className={`ml-auto size-4 transition-transform group-hover:translate-x-1 ${ACCENT_TEXT}`} aria-hidden />
      </div>
      <p className="text-[13px] leading-5 text-muted-foreground">{text.caption}</p>
      <MiniFlow d={d} input={text.input} />
    </a>
  );
}

const link = "font-medium text-foreground underline underline-offset-2";
const NOTICE_URL = "https://github.com/jonpol01/d1a-playground/blob/main/NOTICE";
const HUB = "https://huggingface.co/JohnP1/d1a-e2b";

type AboutText = {
  title: string; what: string; honest: string; caption: string; cols: [string, string, string];
  rows: [string, string, string][]; where: ReactNode; licenses: string;
};
// Accuracy on the same frozen development sets for both models.
const ABOUT: Record<Lang, AboutText> = {
  en: {
    title: "About D1A",
    what: "D1A is a small, open decision model in the Jev style: typed questions in, a calibrated probability for every option out, in one forward pass and with no text generation. It runs on your own machine and speaks the same System One API as Jev, so the TypeSafe SDK works against it unchanged.",
    honest: "Jev is more accurate today. D1A-E2B v0.1 is a one-epoch prototype, and a two-epoch model is training now. What D1A offers is different: it runs locally, keeps your data private, costs nothing per request, has open weights, and uses the same API.",
    caption: "Measured on the same frozen evaluation sets",
    cols: ["", "D1A-E2B v0.1 (1 epoch)", "Jev (TypeSafe, hosted)"],
    rows: [
      ["Accuracy, trained sources (dev)", "0.794", "0.845"],
      ["Accuracy, new sources (dev)", "0.569", "0.857"],
      ["Where it runs", "your machine (Mac / GPU): free, private, open weights", "TypeSafe's cloud API"],
    ],
    where: <>D1A-E2B v0.1 is on the Hugging Face Hub as <a className={link} href={HUB}>JohnP1/d1a-e2b</a> (a LoRA adapter and a pointer head on Gemma 4 E2B).</>,
    licenses: "Licenses",
  },
  ja: {
    title: "D1A について",
    what: "D1A は、Jev と同じ考え方の小さなオープンな判断モデルです。型付きの質問を入れると、1回の順伝播ですべての選択肢に較正済みの確率を返し、テキストは生成しません。あなたのマシンで動き、Jev と同じ System One API を話すので、TypeSafe SDK をそのまま使えます。",
    honest: "現時点では Jev のほうが正確です。D1A-E2B v0.1 は1エポックのプロトタイプで、2エポックのモデルを学習中です。D1A の強みは別のところにあります。ローカルで動き、データが外に出ず、リクエストごとの費用がかからず、重みが公開されていて、API も同じです。",
    caption: "同じ固定の評価セットで測定",
    cols: ["", "D1A-E2B v0.1（1 エポック）", "Jev（TypeSafe、ホスト型）"],
    rows: [
      ["精度: 学習済みのソース（dev）", "0.794", "0.845"],
      ["精度: 新しいソース（dev）", "0.569", "0.857"],
      ["動く場所", "あなたのマシン（Mac / GPU）。無料、プライベート、オープンウェイト", "TypeSafe のクラウド API"],
    ],
    where: <>D1A-E2B v0.1 は Hugging Face Hub の <a className={link} href={HUB}>JohnP1/d1a-e2b</a> にあります（Gemma 4 E2B に LoRA アダプターとポインターヘッドを載せたモデル）。</>,
    licenses: "ライセンス",
  },
};

export function LicensesLink() {
  const label = useText({ en: ABOUT.en.licenses, ja: ABOUT.ja.licenses });
  return <a className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground" href={NOTICE_URL}>{label}</a>;
}

function About() {
  const t = useText(ABOUT);
  return (
    <section aria-labelledby="about" className="mt-20 rounded-3xl border border-border bg-card p-6 shadow-xs md:p-8">
      <h2 id="about" className="font-heading text-xl font-semibold tracking-tight">{t.title}</h2>
      <div className="mt-3 grid gap-4 text-[14px] leading-6 text-muted-foreground md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <p>{t.what}</p>
          <p>{t.honest}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[13px] leading-5">
              <caption className="px-3 pt-2 text-left text-[12px]">{t.caption}</caption>
              <thead>
                <tr className="border-b border-border text-left text-[12px]">{t.cols.map((c, i) => <th key={i} scope="col" className="px-3 py-2 font-normal">{c}</th>)}</tr>
              </thead>
              <tbody>
                {t.rows.map(([k, d1a, jev]) => (
                  <tr key={k} className="border-b border-border align-top last:border-0">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">{k}</th>
                    <td className="px-3 py-1.5 tabular-nums text-foreground">{d1a}</td>
                    <td className="px-3 py-1.5 tabular-nums">{jev}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px]">{t.where}</p>
          <p><LicensesLink /></p>
        </div>
      </div>
    </section>
  );
}

export function UseCases() {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  const lang = useLang();
  useHtmlLang();
  const t = useText(UI);
  const texts = DEMO_TEXT[lang];
  const idx = DEMOS.findIndex((d) => d.id === hash);
  const demo = idx >= 0 ? DEMOS[idx] : null;
  const [model, setModel] = useState<ModelInfo>(null);

  useEffect(() => {
    api.models().then((m) => setModel(m.models[0])).catch((e: Error) => setModel({ error: e.message }));
  }, []);

  const down = model !== null && "error" in model;
  const lmstudio = model !== null && !("error" in model) && model.backend === "lmstudio";

  return (
    <div className="flex w-full flex-col">
      <div className="hero-glow">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 md:px-10">
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <a href="#" onClick={() => window.scrollTo({ top: 0 })} className="flex items-baseline gap-2">
              <span className="d1a-wordmark font-heading text-2xl font-extrabold tracking-tight">D1A</span>
              <span className="font-heading text-[15px] font-medium tracking-tight">playground</span>
            </a>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Link href="/architecture" className="rounded-full border border-border bg-background/70 px-3 py-1 text-[12px] text-muted-foreground shadow-xs backdrop-blur hover:text-foreground">{t.architecture} →</Link>
              <LangSwitch />
              <StatusPill model={model} />
            </div>
          </header>
          <HwMonitor model={model} />

          {!demo && (
            <div className="max-w-3xl pt-14 pb-12 md:pt-20">
              <h1 className="font-heading text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl">
                {t.heroA}<span className="d1a-wordmark">{t.heroB}</span>{t.heroC}
              </h1>
              <p className="mt-5 max-w-2xl text-[16px] leading-7 text-muted-foreground md:text-[17px]">{t.heroSub}</p>
              {t.englishNote && <p className="mt-3 max-w-2xl text-[12px] leading-5 text-muted-foreground">{t.englishNote}</p>}
            </div>
          )}
          {demo && <div className="h-6" />}
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 md:px-10">
        {down && (
          <p role="alert" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-[13px] leading-5 text-destructive">
            {t.down} {START_HINT[lang]}
          </p>
        )}
        {lmstudio && (
          <p className="mb-6 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-[13px] leading-5">{t.lmstudio}</p>
        )}

        {!demo && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEMOS.map((d, i) => <DemoCard key={d.id} d={d} n={i + 1} text={texts[d.id]} />)}
          </div>
        )}

        {demo && (
          <div className="demo-accent" style={accentStyle(demo.accent)}>
            <nav aria-label={t.useCases} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
              <a href="#" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" aria-hidden />{t.all}</a>
              {DEMOS.map((d, i) => (
                <a key={d.id} href={`#${d.id}`} aria-current={i === idx ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors ${i === idx ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground"}`}
                  style={i === idx ? { background: d.accent } : undefined}>
                  {i !== idx && <span className="size-2 rounded-full" style={{ background: d.accent }} aria-hidden />}
                  {texts[d.id].title}
                </a>
              ))}
            </nav>

            <section aria-labelledby="demo-title" className="mt-6">
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-md" style={{ background: demo.accent }}><demo.Icon className="size-6" aria-hidden /></span>
                <div className="min-w-0">
                  <h2 id="demo-title" className="font-heading text-2xl font-bold tracking-tight md:text-3xl"><span className="text-muted-foreground">{idx + 1}.</span> {texts[demo.id].title}</h2>
                  <p className="mt-1 max-w-3xl text-[14px] leading-6 text-muted-foreground">{texts[demo.id].line}</p>
                  {t.englishNote && <p className="mt-1 max-w-3xl text-[11px] leading-5 text-muted-foreground">{t.englishNote}</p>}
                </div>
              </div>
              {/* Keyed by language too, so switching language reloads the demo with that language's examples. */}
              <div className="mt-8"><demo.Component key={`${demo.id}-${lang}`} /></div>
            </section>
          </div>
        )}

        <About />
      </main>
    </div>
  );
}
