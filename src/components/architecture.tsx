"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LangSwitch, LicensesLink } from "@/components/use-cases";
import { useHtmlLang, useText, type Lang } from "@/lib/i18n";

// One page on how D1A works, from the input layout to the roadmap. Numbers are the prototype checkpoint's
// (JohnP1/d1a-e2b, see its model card) and the model code at the commit demo.sh pins (kev/model.py in
// jonpol01/kev). The UI names only D1A; the upstream credit lives in the repository (README, NOTICE).

const link = "font-medium text-foreground underline underline-offset-2";
const C = { state: "#0284c7", q: "#7c3aed", opt: "#d97706", decide: "#e11d48", lora: "#059669", head: "#c026d3" };

/* ------------------------------------------------------------------ diagrams (inline SVG, both themes) */

function Tok({ x, y, w, label, color, mono = true }: { x: number; y: number; w: number; label: string; color?: string; mono?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={26} rx={6} fill={color ? `color-mix(in oklch, ${color} 16%, var(--card))` : "var(--card)"} stroke={color ?? "var(--border)"} />
      <text x={x + w / 2} y={y + 17} textAnchor="middle" className={`${mono ? "font-mono" : ""} fill-foreground text-[11px]`}>{label}</text>
    </g>
  );
}

function LayoutDiagram({ t }: { t: Text }) {
  // [<bos>][<state>] state ... | <q> instr <opt> a </opt> <opt> b </opt> <decide> | <q> ...
  const row = [
    { w: 44, l: "<bos>" }, { w: 58, l: "<state>", c: C.state }, { w: 112, l: t.stateTokens, c: C.state, plain: true },
    { w: 34, l: "<q>", c: C.q }, { w: 70, l: t.instr, c: C.q, plain: true }, { w: 44, l: "<opt>", c: C.opt }, { w: 30, l: "A", c: C.opt }, { w: 48, l: "</opt>", c: C.opt },
    { w: 44, l: "<opt>", c: C.opt }, { w: 30, l: "B", c: C.opt }, { w: 48, l: "</opt>", c: C.opt }, { w: 64, l: "<decide>", c: C.decide },
    { w: 34, l: "<q>", c: C.q }, { w: 26, l: "…" },
  ];
  let x = 8;
  const placed = row.map((r) => { const p = { ...r, x }; x += r.w + 4; return p; });
  const qStart = placed[3].x, q2 = placed[12].x;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${x + 8} 128`} className="h-auto w-full min-w-[640px]" role="img" aria-label={t.layoutAria}>
        {placed.map((p, i) => <Tok key={i} x={p.x} y={30} w={p.w} label={p.l} color={p.c} mono={!p.plain} />)}
        <text x={8} y={18} className="fill-muted-foreground text-[11px]">{t.stateOnce}</text>
        <text x={qStart} y={18} className="fill-muted-foreground text-[11px]">{t.question1}</text>
        <text x={q2} y={18} className="fill-muted-foreground text-[11px]">{t.question2}</text>
        {/* position ids */}
        <text x={8} y={82} className="fill-muted-foreground text-[11px]">{t.positions}</text>
        <text x={8} y={102} className="font-mono fill-foreground text-[11px]">0 1 2 … n−1</text>
        <text x={qStart} y={102} className="font-mono fill-foreground text-[11px]">n n+1 n+2 …</text>
        <text x={q2} y={102} className="font-mono fill-foreground text-[11px]">n …</text>
        <path d={`M ${q2 - 6} 96 C ${q2 - 30} 120, ${qStart + 20} 120, ${qStart + 4} 108`} fill="none" stroke={C.q} strokeDasharray="3 3" />
        <text x={(qStart + q2) / 2} y={122} textAnchor="middle" className="fill-muted-foreground text-[10px]">{t.restart}</text>
      </svg>
    </div>
  );
}

function ModelDiagram({ t }: { t: Text }) {
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 720 230" className="h-auto w-full min-w-[600px]" role="img" aria-label={t.modelAria}>
        <rect x={8} y={20} width={300} height={190} rx={16} className="fill-card stroke-border" />
        <text x={24} y={46} className="font-heading fill-foreground text-[15px] font-semibold">Gemma 4 E2B</text>
        <text x={24} y={64} className="fill-muted-foreground text-[11px]">{t.backboneSub}</text>
        {Array.from({ length: 35 }, (_, i) => {
          const global = i % 5 === 4;
          return <rect key={i} x={24 + i * 7.6} y={80} width={5.6} height={global ? 58 : 40} y2={0} rx={1.5} fill={global ? C.q : "var(--muted-foreground)"} opacity={global ? 0.9 : 0.35} />;
        })}
        <text x={24} y={156} className="fill-muted-foreground text-[11px]">{t.layers}</text>
        <rect x={24} y={168} width={268} height={30} rx={8} fill={`color-mix(in oklch, ${C.lora} 14%, var(--card))`} stroke={C.lora} />
        <text x={158} y={187} textAnchor="middle" className="fill-foreground text-[10px]">{t.lora}</text>

        <path d="M 308 115 L 356 115" stroke="var(--border)" strokeWidth={2} markerEnd="url(#arr)" />
        <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--muted-foreground)" /></marker></defs>

        <rect x={360} y={40} width={150} height={150} rx={16} fill={`color-mix(in oklch, ${C.head} 10%, var(--card))`} stroke={C.head} />
        <text x={435} y={64} textAnchor="middle" className="font-heading fill-foreground text-[14px] font-semibold">{t.head}</text>
        <Tok x={378} y={78} w={114} label="q(h⟨decide⟩)" color={C.decide} />
        <Tok x={378} y={110} w={114} label="k(h⟨/opt⟩ᵢ)" color={C.opt} />
        <text x={435} y={158} textAnchor="middle" className="font-mono fill-foreground text-[11px]">q·kᵢ / √256</text>
        <text x={435} y={176} textAnchor="middle" className="fill-muted-foreground text-[10px]">{t.dp}</text>

        <path d="M 510 115 L 548 115" stroke="var(--border)" strokeWidth={2} markerEnd="url(#arr)" />
        <rect x={552} y={60} width={160} height={110} rx={16} className="fill-card stroke-border" />
        <text x={632} y={84} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">softmax(z / T)</text>
        <text x={632} y={102} textAnchor="middle" className="fill-muted-foreground text-[10px]">{t.temp}</text>
        {[0.62, 0.27, 0.11].map((p, i) => (
          <g key={i}>
            <text x={568} y={127 + i * 14} className="font-mono fill-muted-foreground text-[10px]">{["A", "B", "C"][i]}</text>
            <rect x={582} y={119 + i * 14} width={110} height={6} rx={3} className="fill-muted" />
            <rect x={582} y={119 + i * 14} width={110 * p} height={6} rx={3} fill={i === 0 ? "var(--foreground)" : "var(--muted-foreground)"} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function MaskGrid({ x, y, cells, title }: { x: number; y: number; cells: string[][]; title: string }) {
  const s = 14;
  return (
    <g>
      <text x={x} y={y - 8} className="fill-muted-foreground text-[10px]">{title}</text>
      {cells.map((r, i) => r.map((c, j) => (
        <rect key={`${i}-${j}`} x={x + j * s} y={y + i * s} width={s - 2} height={s - 2} rx={2}
          fill={c === "." ? "var(--muted)" : `color-mix(in oklch, ${c === "s" ? C.state : c === "1" ? C.q : C.opt} 70%, var(--card))`} />
      )))}
    </g>
  );
}

function FormsDiagram({ t }: { t: Text }) {
  // packed block-causal mask over [state s s | question 1 | question 2]: a question sees the state and itself only
  const seg = ["s", "s", "s", "1", "1", "1", "2", "2", "2"];
  const packed = seg.map((a, i) => seg.map((b, j) => (j > i ? "." : b === "s" || a === b ? b : ".")));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <figure className="rounded-2xl border border-border bg-card p-4">
        <svg viewBox="0 0 380 170" className="h-auto w-full" role="img" aria-label={t.packedAria}>
          <MaskGrid x={16} y={30} cells={packed} title={t.maskTitle} />
          <text x={160} y={44} className="fill-foreground text-[11px] font-semibold">{t.packedName}</text>
          {t.packedLines.map((l, i) => <text key={i} x={160} y={64 + i * 16} className="fill-muted-foreground text-[10px]">{l}</text>)}
        </svg>
      </figure>
      <figure className="rounded-2xl border border-border bg-card p-4">
        <svg viewBox="0 0 380 170" className="h-auto w-full" role="img" aria-label={t.rowsAria}>
          <rect x={16} y={24} width={96} height={30} rx={8} fill={`color-mix(in oklch, ${C.state} 18%, var(--card))`} stroke={C.state} />
          <text x={64} y={43} textAnchor="middle" className="fill-foreground text-[11px]">state</text>
          <text x={64} y={70} textAnchor="middle" className="fill-muted-foreground text-[10px]">{t.prefixCache}</text>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <path d={`M 112 39 C 130 39, 130 ${92 + i * 26}, 146 ${92 + i * 26}`} fill="none" stroke="var(--border)" />
              <rect x={146} y={80 + i * 26} width={120} height={22} rx={6} fill={`color-mix(in oklch, ${C.q} 14%, var(--card))`} stroke={C.q} />
              <text x={206} y={95 + i * 26} textAnchor="middle" className="fill-foreground text-[10px]">{t.rowLabel(i + 1)}</text>
            </g>
          ))}
          <text x={160} y={40} className="fill-foreground text-[11px] font-semibold">{t.rowsName}</text>
          <text x={160} y={58} className="fill-muted-foreground text-[10px]">{t.rowsLine}</text>
        </svg>
      </figure>
    </div>
  );
}

function ServingDiagram({ t }: { t: Text }) {
  const box = (x: number, y: number, w: number, title: string, sub: string, color: string) => (
    <g>
      <rect x={x} y={y} width={w} height={62} rx={14} fill={`color-mix(in oklch, ${color} 10%, var(--card))`} stroke={color} />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{title}</text>
      <text x={x + w / 2} y={y + 44} textAnchor="middle" className="fill-muted-foreground text-[10px]">{sub}</text>
    </g>
  );
  const arrow = (x1: number, x2: number, y: number, label: string) => (
    <g>
      <path d={`M ${x1} ${y} L ${x2} ${y}`} stroke="var(--muted-foreground)" strokeWidth={1.5} markerEnd="url(#arr2)" className="flow-dash" />
      <text x={(x1 + x2) / 2} y={y - 6} textAnchor="middle" className="font-mono fill-muted-foreground text-[9px]">{label}</text>
    </g>
  );
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 860 190" className="h-auto w-full min-w-[680px]" role="img" aria-label={t.servingAria}>
        <defs><marker id="arr2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--muted-foreground)" /></marker></defs>
        {box(8, 20, 130, t.browser, t.browserSub, "#64748b")}
        {arrow(138, 180, 51, "/d1a")}
        {box(182, 20, 150, t.proxy, t.proxySub, "#0284c7")}
        {arrow(332, 374, 51, ":3031")}
        {box(376, 20, 200, t.next, t.nextSub, "#7c3aed")}
        {arrow(576, 618, 51, ":8009")}
        {box(620, 20, 232, t.server, t.serverSub, "#059669")}
        <path d="M 476 82 L 476 118" stroke="var(--muted-foreground)" strokeDasharray="3 3" markerEnd="url(#arr2)" />
        {box(376, 120, 200, t.hw, t.hwSub, "#f59e0b")}
        <path d="M 736 82 L 736 118" stroke="var(--muted-foreground)" strokeDasharray="3 3" markerEnd="url(#arr2)" />
        {box(620, 120, 232, t.lm, t.lmSub, "#94a3b8")}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ text */

const EN = {
  back: "Playground", title: "How D1A works", kicker: "Architecture",
  intro: "D1A is a family of small decision models. A model reads one document (the state) and answers a set of typed questions about it, each with named options, and returns a calibrated probability for every option in one forward pass. There is no generated text: the answer is read straight off the network. The playground serves D1A-E2B v0.1 (1 epoch), built on Gemma 4 E2B.",
  credit: <>It speaks the same System One API as Jev, so the TypeSafe SDK works against it unchanged. D1A-E2B v0.1 is on the Hugging Face Hub as <a className={link} href="https://huggingface.co/JohnP1/d1a-e2b">JohnP1/d1a-e2b</a>.</>,
  s1: "1. The input layout",
  s1body: <>The state comes first, once; then each question as its own branch: <code>&lt;q&gt;</code> instructions, one <code>&lt;opt&gt; … &lt;/opt&gt;</code> span per option, and <code>&lt;decide&gt;</code>. On Gemma 4 the five delimiters are the reserved tokens <code>&lt;unused0&gt;</code>–<code>&lt;unused4&gt;</code> (state, q, opt, /opt, decide): distinct embeddings that user text cannot produce, so nothing needs adding to the vocabulary. Position ids restart after the state for every question, so each question sees exactly what it would see alone.</>,
  stateTokens: "state tokens…", instr: "instructions", stateOnce: "state (read once)", question1: "question 1", question2: "question 2",
  positions: "position ids", restart: "positions restart per question", layoutAria: "Token layout of a request",
  s2: "2. The model",
  s2body: "A Gemma 4 E2B backbone with a LoRA adapter, and a small pointer head. The head projects the hidden state at <decide> into a query and the hidden state at each </opt> into a key; the scaled dot products are the option logits. Dividing by a temperature fitted on held-out data makes the softmax probabilities calibrated; the argmax does not change.",
  backboneSub: "35 layers · hidden 1,536 · per-layer embeddings", layers: "4 of every 5 layers: sliding window 512 · 1 of 5: global",
  lora: "LoRA r=16 on q k v o · gate up down  ·  24.9M trainable", head: "Pointer head", dp: "q, k: 1,536 → 256", temp: "T = 1.48 (fitted, v0.1)",
  modelAria: "Backbone, pointer head and calibrated softmax",
  s3: "3. Two equivalent execution forms",
  s3body: "The same answers can be computed two ways; the two agree to fp32 noise (a test checks it).",
  maskTitle: "attention mask (state | Q1 | Q2)", packedName: "Packed: one pass",
  packedLines: ["the whole request is one sequence", "block-causal mask: a question sees", "the state and itself, not the others", "sliding layers: a second mask whose", "distance counts position ids"],
  packedAria: "Packed form with a block-causal mask", rowsName: "Rows: state once, then rows", rowsLine: "each question is its own causal row", prefixCache: "prefix cache", rowLabel: (i: number) => `Q${i}: <q> … <decide>`, rowsAria: "Rows form over a cached state",
  s3when: "Where each is used: short requests on an attention-only backbone such as Gemma 4 run packed. Requests longer than 16,384 tokens, states of 384 tokens or more (served from the prefix cache), and hybrid backbones (Qwen3.5's recurrent layers cannot honour the mask) run as rows. The MLX / mobile path will use rows.",
  s4: "4. Serving path on this deployment",
  s4body: "The browser only ever talks to the playground. A port-80 reverse proxy forwards /d1a to the Next.js app, which serves the page, forwards model API calls to the model server and reads the hardware stats. The model server speaks the System One API and runs on the Apple GPU (MPS) in bf16, with PyTorch's share of unified memory capped by the MPS watermark ratios.",
  browser: "Browser", browserSub: "JA / EN UI", proxy: "Reverse proxy", proxySub: "port 80 · /d1a", next: "Next.js playground", nextSub: "basePath /d1a · API proxy",
  server: "Model server", serverSub: "System One API · MPS · bf16 · capped", hw: "/api/hw", hwSub: "ioreg · footprint · memory_pressure",
  lm: "LM Studio mode (fallback)", lmSub: "prompted chat model, uncalibrated", servingAria: "Serving path from the browser to the model server",
  s5: "5. Training and data",
  s5body: "Trained on the frozen decision-v7 suite: about 12.5k training records (12,506 after the context rule under Gemma's tokenizer), public classification datasets plus generated policy and rule data.",
  recipe: [["recipe", "lr 1e-4 · batch 4 × accum 2 · bf16"], ["hardware", "one NVIDIA L4 on HF Jobs"], ["v0.1", "1 epoch · 1,564 steps · 81 min · 14.6 GB peak"], ["next", "2-epoch run in progress"]],
  results: "Results so far (accuracy on the same frozen development sets)", colModel: "model", colDev: "trained sources", colNew: "new sources",
  rows: [["D1A-E2B v0.1 (1 epoch)", "0.794", "0.569"], ["Jev (TypeSafe, hosted)", "0.845", "0.857"]],
  resultsNote: "Jev is more accurate today; the two-epoch D1A model now training is the next step.",
  s6: "6. Roadmap",
  road: [
    ["Portable foundation", "a written SPEC.md, the merged backbone plus head.safetensors and d1a_config.json, and golden test vectors every port must reproduce"],
    ["MLX / iOS", "the rows form on Apple's MLX, for on-device use"],
    ["Android", "the same spec and test vectors on Android"],
  ],
};
type Text = typeof EN;

const JA: Text = {
  back: "プレイグラウンド", title: "D1A の仕組み", kicker: "アーキテクチャ",
  intro: "D1A は小さな判断モデルのファミリーです。モデルは1つの文書（state）を読み、それについての型付きの質問（それぞれに名前付きの選択肢がある）に答え、1回の順伝播ですべての選択肢に較正済みの確率を返します。テキストは生成しません。答えはネットワークから直接読み取ります。プレイグラウンドでは、Gemma 4 E2B をベースにした D1A-E2B v0.1（1 エポック）が動いています。",
  credit: <>Jev と同じ System One API を話すので、TypeSafe SDK をそのまま使えます。D1A-E2B v0.1 は Hugging Face Hub の <a className={link} href="https://huggingface.co/JohnP1/d1a-e2b">JohnP1/d1a-e2b</a> にあります。</>,
  s1: "1. 入力の並べ方",
  s1body: <>最初に state を1回だけ置き、続けて質問ごとに1つの枝を置きます。<code>&lt;q&gt;</code> と指示文、選択肢ごとに <code>&lt;opt&gt; … &lt;/opt&gt;</code>、最後に <code>&lt;decide&gt;</code> です。Gemma 4 では、5つの区切りに予約トークン <code>&lt;unused0&gt;</code>〜<code>&lt;unused4&gt;</code>（state、q、opt、/opt、decide）を使います。ユーザーのテキストからは生成されない独立した埋め込みなので、語彙を追加する必要はありません。位置 ID は state の後で質問ごとにリセットされるため、各質問は単独で読んだときとまったく同じものを見ます。</>,
  stateTokens: "state のトークン…", instr: "指示文", stateOnce: "state（1回だけ読む）", question1: "質問 1", question2: "質問 2",
  positions: "位置 ID", restart: "位置は質問ごとにリセット", layoutAria: "リクエストのトークン配置",
  s2: "2. モデル",
  s2body: "Gemma 4 E2B のバックボーンに LoRA アダプターを載せ、小さなポインターヘッドを付けたものです。ヘッドは <decide> の隠れ状態をクエリに、各 </opt> の隠れ状態をキーに射影し、スケール付きの内積を選択肢のロジットにします。検証用データで求めた温度で割ることで softmax の確率が較正されます。最上位の選択肢は変わりません。",
  backboneSub: "35 層 · 隠れ次元 1,536 · 層ごとの埋め込み", layers: "5層のうち4層: スライディングウィンドウ 512 · 1層: グローバル",
  lora: "LoRA r=16（q k v o gate up down）· 学習 24.9M", head: "ポインターヘッド", dp: "q, k: 1,536 → 256", temp: "T = 1.48（v0.1 で推定）",
  modelAria: "バックボーン、ポインターヘッド、較正済み softmax",
  s3: "3. 同じ答えを出す2つの実行形式",
  s3body: "同じ答えを2通りの方法で計算できます。両者の差は fp32 の誤差程度です（テストで確認しています）。",
  maskTitle: "アテンションマスク（state | Q1 | Q2）", packedName: "Packed: 1回の順伝播",
  packedLines: ["リクエスト全体を1本の系列にする", "ブロック因果マスク: 各質問は", "state と自分だけを見て、他は見ない", "スライディング層: 位置 ID で", "距離を数える2つ目のマスク"],
  packedAria: "ブロック因果マスクによる packed 形式", rowsName: "Rows: state は1回、質問は行ごと", rowsLine: "各質問を独立した因果的な行で計算", prefixCache: "プレフィックスキャッシュ", rowLabel: (i: number) => `Q${i}: <q> … <decide>`, rowsAria: "キャッシュした state の上で rows 形式",
  s3when: "使い分け: Gemma 4 のようなアテンションのみのバックボーンで短いリクエストは packed で実行します。16,384 トークンを超えるリクエスト、384 トークン以上の state（プレフィックスキャッシュから再利用）、ハイブリッドのバックボーン（Qwen3.5 の再帰層はマスクに従えない）は rows で実行します。MLX / モバイル版は rows を使う予定です。",
  s4: "4. このデプロイでの配信経路",
  s4body: "ブラウザが直接話す相手はプレイグラウンドだけです。ポート 80 のリバースプロキシが /d1a を Next.js アプリに転送し、アプリはページを返すとともにモデル API の呼び出しをモデルサーバーに転送し、ハードウェアの状態を読み取ります。モデルサーバーは System One API を話し、Apple GPU（MPS）上で bf16 で動き、ユニファイドメモリのうち PyTorch が使える量を MPS のウォーターマーク比率で制限しています。",
  browser: "ブラウザ", browserSub: "JA / EN の UI", proxy: "リバースプロキシ", proxySub: "ポート 80 · /d1a", next: "Next.js プレイグラウンド", nextSub: "basePath /d1a · API を転送",
  server: "モデルサーバー", serverSub: "System One API · MPS · bf16 · メモリ上限", hw: "/api/hw", hwSub: "ioreg · footprint · memory_pressure",
  lm: "LM Studio モード（代替）", lmSub: "プロンプトで指示するチャットモデル、未較正", servingAria: "ブラウザからモデルサーバーまでの配信経路",
  s5: "5. 学習とデータ",
  s5body: "固定スイート decision-v7 を使って学習しました。学習レコードは約 1.25 万件（Gemma のトークナイザーでコンテキスト規則を適用した後で 12,506 件）で、公開の分類データセットと、生成したポリシー・ルールのデータからなります。",
  recipe: [["レシピ", "lr 1e-4 · バッチ 4 × 勾配累積 2 · bf16"], ["ハードウェア", "HF Jobs の NVIDIA L4 1基"], ["v0.1", "1 エポック · 1,564 ステップ · 81 分 · ピーク 14.6 GB"], ["次", "2 エポックの学習を実行中"]],
  results: "これまでの結果（同じ固定の開発用セットでの精度）", colModel: "モデル", colDev: "学習済みのソース", colNew: "新しいソース",
  rows: [["D1A-E2B v0.1（1 エポック）", "0.794", "0.569"], ["Jev（TypeSafe、ホスト型）", "0.845", "0.857"]],
  resultsNote: "現時点では Jev のほうが正確です。次の段階は、学習中の 2 エポックの D1A モデルです。",
  s6: "6. ロードマップ",
  road: [
    ["移植のための土台", "仕様書 SPEC.md、マージ済みバックボーンと head.safetensors・d1a_config.json、すべての移植版が再現すべきゴールデンテストベクトル"],
    ["MLX / iOS", "Apple の MLX 上で rows 形式を動かし、端末上で使えるようにする"],
    ["Android", "同じ仕様とテストベクトルで Android に移植する"],
  ],
};

/* ------------------------------------------------------------------ page */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-xs md:p-8">
      <h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-4 text-[14px] leading-6 text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-foreground">{children}</div>
    </section>
  );
}

export function Architecture() {
  useHtmlLang();
  const t = useText<Text>({ en: EN, ja: JA } satisfies Record<Lang, Text>);
  return (
    <div className="flex w-full flex-col">
      <div className="hero-glow">
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 md:px-10">
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="d1a-wordmark font-heading text-2xl font-extrabold tracking-tight">D1A</span>
              <span className="font-heading text-[15px] font-medium tracking-tight">playground</span>
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/" className="rounded-full border border-border bg-background/70 px-3 py-1 text-[12px] text-muted-foreground shadow-xs backdrop-blur hover:text-foreground">← {t.back}</Link>
              <LangSwitch />
            </div>
          </header>
          <div className="max-w-3xl pt-14 pb-12 md:pt-20">
            <p className="font-mono text-[12px] text-muted-foreground">{t.kicker}</p>
            <h1 className="mt-2 font-heading text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl"><span className="d1a-wordmark">{t.title}</span></h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-7 text-muted-foreground">{t.intro}</p>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted-foreground">{t.credit}</p>
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 sm:px-6 md:px-10">
        <Section title={t.s1}><p>{t.s1body}</p><LayoutDiagram t={t} /></Section>
        <Section title={t.s2}><p>{t.s2body}</p><ModelDiagram t={t} /></Section>
        <Section title={t.s3}><p>{t.s3body}</p><FormsDiagram t={t} /><p>{t.s3when}</p></Section>
        <Section title={t.s4}><p>{t.s4body}</p><ServingDiagram t={t} /></Section>
        <Section title={t.s5}>
          <p>{t.s5body}</p>
          <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[8rem_minmax(0,1fr)]">
            {t.recipe.map(([k, v]) => <div key={k} className="contents"><dt className="font-medium text-foreground">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[13px]">
              <caption className="px-3 pt-2 text-left text-[12px]">{t.results}</caption>
              <thead><tr className="border-b border-border text-left text-[12px]"><th className="px-3 py-2 font-normal">{t.colModel}</th><th className="px-3 py-2 text-right font-normal">{t.colDev}</th><th className="px-3 py-2 text-right font-normal">{t.colNew}</th></tr></thead>
              <tbody>
                {t.rows.map(([m, a, b], i) => (
                  <tr key={m} className={`border-b border-border last:border-0 ${i === 0 ? "text-foreground" : ""}`}><td className="px-3 py-1.5">{m}</td><td className="px-3 py-1.5 text-right tabular-nums">{a}</td><td className="px-3 py-1.5 text-right tabular-nums">{b}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px]">{t.resultsNote}</p>
        </Section>
        <Section title={t.s6}>
          <ol className="grid gap-3 md:grid-cols-3">
            {t.road.map(([h, d], i) => (
              <li key={h} className="rounded-2xl border border-border bg-background/50 p-4">
                <p className="font-mono text-[11px]">{String(i + 1).padStart(2, "0")}</p>
                <p className="font-heading text-[15px] font-semibold text-foreground">{h}</p>
                <p className="mt-1 text-[13px] leading-5">{d}</p>
              </li>
            ))}
          </ol>
        </Section>
        <p className="text-center"><LicensesLink /></p>
      </main>
    </div>
  );
}
