# The Hundred — Wishlist v2

「やりたい」を思いついた瞬間に残し、その年の自分が選んだものと一年を過ごす Yearly Wishlist のプロトタイプです。

## v2 の考え方

- ログインせず、開いたらすぐに「やりたいかも」を残せる
- 思いついた Want と、その年に正式採用した Selection を分けて扱う
- 年間100件は思いつきの上限ではなく、その年に選べる Wish の上限
- 達成／未達成の二択ではなく、叶った・まだやりたい・いったん手放すを追記型の履歴に残す
- Wish から生まれた新しい Want を Branch としてつなぐ
- 人、場所、ひとことは任意。振り返りを宿題にしない

## プロトタイプで試せる流れ

1. Home で「やりたいかも」をタイトルだけで保存
2. Season Update で「やりたいかも」から今年の Wish を選ぶ
3. 季節ごとに今年の Wish を選び直す
4. Wish Detail から「叶った！」を記録
5. 任意で場所、人、ひとこと、Branch を残す
6. Year Review で Footprints と Possibilities を振り返る

## 実行方法

ビルドは不要です。`index.html` をブラウザで開いてください。初回は空の状態から始まり、任意でデモデータを読み込めます。

Homeの基準テーマは `PLAIN` のcharcoal版です。通常URLでは `plain-dark.css` を適用し、`?theme=plain-light` を付けると `plain.css` の白背景版を比較できます。データと機能は両テーマで共通です。`2026.css` には比較用のEDITORIAL表現も残しています。

データは `storage.js` の保存アダプターを通して、まずブラウザの `localStorage` に即時保存されます。Supabase設定がある場合はAnonymous AuthでGuestを作成し、同じ状態をクラウドへ同期します。既存localStorageは初回接続時にバックアップを残してクラウドへ移行されます。以前のversion 2形式が見つかった場合は、WantとSelectionを維持したまま、状態上書き型からイベント履歴型へ自動移行します。

## クラウド同期・限定共有

- Guestはログイン不要で開始し、Supabase Anonymous Authの内部user IDで保存
- 後からメールを追加しても同じuser IDとデータを維持
- 別端末はメール・パスワードで同じデータを取得
- 固有Share Codeによる相互承認制
- 承認済みの相手にはWishタイトル、達成状態、許可時のみ達成日を表示
- メモ、Places、People、手放した理由、履歴、Year Reviewは非公開
- 公開可否はUIではなくPostgresのRLSと認可済みDB関数で制御

導入手順と本番前チェックは `supabase/SETUP.md`、テーブル・RLS・DB関数は `supabase/schema.sql` にあります。Supabase未設定時は従来どおりlocalStorageだけで動作します。
