# 脱獄 vs 看守（ターン制プリズンブレイク対戦）

スマホ専用ブラウザ（PWA）の 1対1・約10分の心理戦ゲーム。
**囚人**は模範囚を演じながら脱獄を企て、**看守**は違反の現行犯を押さえて捕らえる。
Cloudflare Workers + Durable Objects によるリアルタイム対戦。

- 企画書：[`docs/企画書.md`](docs/企画書.md)
- アイデアメモ：[`docs/idea-dump.md`](docs/idea-dump.md)

## 遊び方（ルール要点）
- 全14日（暫定）。各日「点呼(イベント)→行動→判定→夜」で進む。
- 囚人の勝ち：脱獄（トンネル等）を完遂 / 武器で看守を撃破。
- 看守の勝ち：期日まで監督しきる / 違反を**現行犯**で確認→**一発アウト**→**追跡フェーズ**で捕縛。
  - **模範囚（違反未確認）は倒せない** ＝ このゲームの核。
- **非対称の霧**：囚人は未探索マスが見えない／看守は囚人が作った隠しマス（トンネル）が見えない。

## 構成
```
public/            PWAフロント（HTML/CSS/JS, manifest, service worker）
src/worker.js      Worker エントリ（静的配信 + /api/room/:id ルーティング）
src/game-room.js   Durable Object（1部屋=1接続管理・broadcast）
src/engine/        ゲームエンジン（純ロジック / Cloudflare非依存）
  map.js  cards.js  engine.js  view.js  rng.js
test/              エンジンのNodeテスト
```
- 権威サーバ型：状態はDOが保持し、各クライアントには **役割が見てよい情報だけ**（`view.js`）を配信 → 霧とチート耐性を両立。

## 開発
```bash
npm install
npm test        # エンジンのユニットテスト（Node）
npm run dev     # ローカル起動（wrangler dev → http://127.0.0.1:8787）
```
2つのブラウザ/タブで同じ「あいことば」を入れて入室すると対戦できる（先入室が囚人）。

## デプロイ（Cloudflare）
```bash
npx wrangler login
npm run deploy  # wrangler deploy
```
**Workers 無料プランで動作します。** Durable Objects は SQLite ストレージ版（本リポジトリの
`new_sqlite_classes` 設定）であれば無料プランで利用可能です。無料枠の範囲内なら追加費用なしで運用でき、
個人・少人数の対戦には十分です（大規模化した場合のみ有料プランを検討）。

## ステータス
MVP（v0.1）。数値・カード・脱獄ルートは暫定で、プレイテストで調整予定。
多人数/非同期モードは将来拡張（企画書 §16）。名称・素材はオリジナル。
