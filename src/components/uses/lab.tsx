"use client";

// 14, where the build has an agent lab (AGENT_LAB_URL): the lab's 3PL shift, in place of the agent's day. The lab is its
// own server under /agent-lab; this page says what it shows and opens it.
import { ArrowRight } from "lucide-react";
import { BASE_PATH } from "@/lib/d1a";
import { useText } from "@/lib/i18n";
import { accentButton } from "@/components/uses/shared";

const TEXT = {
  en: {
    see: "What you will see",
    points: [
      "Two warehouses side by side: the same agent works the same eleven tickets in each, by running real commands against a demo warehouse system.",
      "In one, nothing checks the agent. In the other, each command goes first to D1A's Claude Code hook: allowed, passed by the client's runbook, asked of you, or denied, with D1A's probabilities.",
      "When it asks, a box at the top of the screen waits for you as the supervisor: approve or reject.",
      "At the end, the problems each warehouse has: a ship-to address changed on an order note, deleted stock history, one client's data sent to another.",
    ],
    measured: "One run of the shift",
    numbers: "6 of 11 tickets finished by the agent alone, 5 decisions for the supervisor, 3 commands denied by D1A; no problem in the checked warehouse, 4 in the unchecked one.",
    caveat: "A simulation with dummy data, not a customer result; the runbook's and the cards' wording was tuned on these tickets.",
    open: "Start the shift", coding: "The coding lab (English)",
    note: "Each visitor gets two throwaway sandboxes with no route to the internet; they are removed when the page closes.",
  },
  ja: {
    see: "見られるもの",
    points: [
      "2 つの倉庫を並べて表示します。同じエージェントが同じ 11 件のチケットを、デモ用の倉庫システムに本物のコマンドを打って処理します。",
      "片方では何もエージェントを確認しません。もう片方では各コマンドを先に D1A の Claude Code フックに通し、実行・荷主の手順書で承認・あなたに確認・拒否のどれかに分けます。D1A の確率も表示します。",
      "確認が必要なときは、画面上部の枠がスーパーバイザーのあなたの判断（承認か却下）を待ちます。",
      "最後に、それぞれの倉庫に起きた問題を示します。注文メモによる配送先の変更、在庫履歴の削除、別の荷主へのデータ送信などです。",
    ],
    measured: "シフト 1 回の結果",
    numbers: "11 件中 6 件をエージェントだけで完了、スーパーバイザーの判断 5 回、D1A が拒否したコマンド 3 件。確認ありの倉庫は問題 0 件、確認なしの倉庫は 4 件。",
    caveat: "ダミーデータによるシミュレーションで、顧客での実績ではありません。手順書とカードの文言はこのチケットで調整しました。",
    open: "シフトを始める", coding: "コーディング・ラボ（英語）",
    note: "訪問者ごとに、インターネットへの経路がない使い捨てのサンドボックスを 2 つ用意し、ページを閉じると削除します。",
  },
};

export function AgentLabDemo() {
  const t = useText(TEXT);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <h3 className="font-heading text-lg font-semibold tracking-tight">{t.see}</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-6 text-muted-foreground">
          {t.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={`${BASE_PATH}/agent-lab/wms`} className={`${accentButton} inline-flex items-center gap-1.5 text-[14px] leading-9`}>
            {t.open}<ArrowRight className="size-4" aria-hidden />
          </a>
          <a href={`${BASE_PATH}/agent-lab`} className="text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground">{t.coding}</a>
        </div>
        <p className="mt-3 text-[12px] leading-5 text-muted-foreground">{t.note}</p>
      </section>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <h3 className="font-heading text-lg font-semibold tracking-tight">{t.measured}</h3>
        <p className="mt-3 text-[14px] leading-6">{t.numbers}</p>
        <p className="mt-3 text-[12px] leading-5 text-muted-foreground">{t.caveat}</p>
      </section>
    </div>
  );
}
