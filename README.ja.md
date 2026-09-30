# D1A プレイグラウンド — 9つのユースケース

[English](README.md)

小さな判断モデルが1つの文書を読み、それについての型付きの質問にいくつか答え、すべての選択肢に確率を返します。このプレイグラウンドでは、その仕組みで9つの実際の仕事をライブで動かします。プロンプトのモデル振り分け、プロンプトインジェクションのブロック、エージェントのツール呼び出しの制御、受信トレイの仕分け、検索結果のリランキング、LLM の回答の採点、表のラベル付け、ロボットのリアルタイム制御、そして実行するか人に回すかの判断です。どの例も編集でき、どの答えにも確率の分布全体が表示されます。

D1A は Jared Palmer による [Kev](https://github.com/jaredpalmer/kev)（Apache-2.0）をベースにしています。D1A は Jared Palmer および Kev プロジェクトとは提携しておらず、推奨も受けていません。プレイグラウンドでは、Gemma 4 E2B をベースにした1エポックのモデル D1A-E2B v0.1（[JohnP1/d1a-e2b](https://huggingface.co/JohnP1/d1a-e2b)、タグ `v0.1-1epoch`、旧 JohnP1/kev-gemma4-e2b）を使います。このモデルはフォーク [jonpol01/kev](https://github.com/jonpol01/kev) の Gemma 4 対応で学習しました。

## クイックスタート

[git](https://git-scm.com/downloads)、[Node.js](https://nodejs.org) 20.9 以上、[uv](https://docs.astral.sh/uv/) が必要です。Python は不要です（なければ uv が Python 3.13 を取得します）。スクリプトがすべて確認し、足りないものを教えてくれます。

**macOS、Linux、WSL**

```bash
git clone https://github.com/jonpol01/d1a-playground.git && cd d1a-playground
./demo.sh
```

**Windows（PowerShell）**

```powershell
git clone https://github.com/jonpol01/d1a-playground.git; cd d1a-playground
powershell -ExecutionPolicy Bypass -File .\demo.ps1
```

スクリプトはモデルサーバーを `.demo/venv` にインストールし（[jonpol01/kev](https://github.com/jonpol01/kev) のコミットに固定）、ポート 8009 で起動し、Web アプリをポート 3001（使用中なら 3011、3021〜3030）で起動してブラウザを開きます。初回は Python パッケージ約 1 GB とモデル約 10 GB をダウンロードします。2回目以降は約 20 秒で起動します。ログは `.demo/` に出ます。Ctrl+C ですべて止まります。ターミナルを閉じてしまった場合は `./demo.sh stop`（または `.\demo.ps1 stop`）で止められます。

## 画面

UI は既定で日本語で、ヘッダーの JA / EN で切り替えられます。選択はブラウザに保存され、URL の `?lang=en` または `?lang=ja` が優先されます。日本語モードでは例文も日本語です。プロトタイプのモデルは英語のデータで学習しているため、日本語の文言では答えが弱い、または不安定だったデモでは、読む文章は日本語のまま、質問文と選択肢の説明を英語で送っています（どのデモがそうかは各ファイルに書いてあります）。ヘッダーの下のハードウェアモニターには、バックエンド、リクエストごとのレイテンシとその推移、スループット、モデルサーバーのマシンの GPU 使用率・メモリ・負荷が表示されます（`GET /api/hw` が `ioreg`、`footprint`、`memory_pressure`、`nvidia-smi` など権限不要のコマンドで取得します）。`/architecture` ではモデルの仕組みを説明しています。

## Mac で常時稼働させる

`mini.sh` はプレイグラウンドを常時稼働のサービスとして動かします。モデルサーバーと Web アプリの本番ビルドを2つのユーザー LaunchAgent（`io.github.jonpol01.d1a-model` と `io.github.jonpol01.d1a-web`）として登録し、ログイン時に起動し、クラッシュしても再起動します。[Homebrew](https://brew.sh) の `node` と `uv` が必要です。

```bash
git clone https://github.com/jonpol01/d1a-playground.git ~/d1a-playground && cd ~/d1a-playground
./mini.sh install    # モデルサーバーを .demo/venv に入れ、npm ci とビルドをして、LaunchAgent を書いて読み込む
./mini.sh status     # 読み込まれているか、両方のポートが応答するか
./mini.sh stop       # 両方を止める。./mini.sh start で再開
./mini.sh update     # git pull、再インストール、再ビルド、再起動
```

ログは `~/Library/Logs/d1a-model.log` と `~/Library/Logs/d1a-web.log` です。設定は `install` と `update` が読み、`.demo/mini.env` に保存します。`KEV_PORT`（8009）、`PORT`（3031）、`HOST`（127.0.0.1。LAN に直接公開するなら 0.0.0.0）、`D1A_BASE_PATH`（空）、MPS のメモリ上限 `PYTORCH_MPS_HIGH_WATERMARK_RATIO` / `PYTORCH_MPS_LOW_WATERMARK_RATIO`（0.7 / 0.6。他の用途にも使う 32 GB の Mac 向けの値です。スワップさせずに早めに失敗させたいときは下げてください）、モデルサーバーの長い state のキャッシュ `KEV_PREFIX_CACHE` / `KEV_PREFIX_MAX_TOKENS`（4 / 65536）。モデルサーバーは常に 127.0.0.1 だけで待ち受けます。LaunchAgent はユーザーがログインしている間だけ動くので、再起動後に自動で戻したい場合は自動ログインを有効にしてください。インストールには uv の設定がそのまま効きます（TLS を検査するネットワークでは `UV_SYSTEM_CERTS=1`、既定のキャッシュに書き込めないときは `UV_CACHE_DIR`）。

**リバースプロキシの下、サブパスで公開する場合。** `D1A_BASE_PATH=/d1a` でビルドすると（例: `D1A_BASE_PATH=/d1a ./mini.sh install`）、ページ、アセット、モデル API のプロキシ（`/d1a/kev/...`）、`/d1a/api/hw` のすべてが `/d1a` の下で提供されます。プロキシでは `/d1a` で始まるパスを、パスを変えずに `http://127.0.0.1:3031` に転送してください（例: `http://<your-mac-ip>/d1a`）。`next build` と `next start` の両方に同じ `D1A_BASE_PATH` が必要です（mini.sh は両方に設定します）。`.demo/mini.env` を書き換えたら `./mini.sh update` で反映します。

## 必要なもの・制限事項・トラブルシューティング

メモリや速度の目安、LM Studio モード、制限事項、トラブルシューティング、開発手順は [README.md](README.md)（英語）を参照してください。要点: モデルサーバーはアイドル時に約 12 GB、ピーク時に約 15 GB のメモリを使います（M1 Max 64 GB で計測）。チェックポイントは英語データで学習した1エポックのプロトタイプです。

## クレジットとライセンス

- Jared Palmer による [Kev](https://github.com/jaredpalmer/kev)（Apache-2.0）: モデルの構造、学習と配信のコード、System One API のクライアント、このアプリの元になったプレイグラウンド。変更して取り込んだファイルにはその旨のヘッダーがあり、[NOTICE](NOTICE) に一覧があります。
- Google による [Gemma 4](https://huggingface.co/google/gemma-4-E2B)（Apache-2.0）: チェックポイントのベースモデル。
- このプレイグラウンド、Kev の Gemma 4 対応、[JohnP1/d1a-e2b](https://huggingface.co/JohnP1/d1a-e2b) チェックポイント: John Soliva（[jonpol01](https://github.com/jonpol01)）。

Apache License 2.0 で提供しています。[LICENSE](LICENSE) と [NOTICE](NOTICE) を参照してください。
