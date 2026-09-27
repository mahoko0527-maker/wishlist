# Supabase setup

1. Supabaseでプロジェクトを作成し、Auth → Providers → Anonymous Sign-Insを有効にします。Guestへメールidentityを追加できるよう、Manual Linkingも有効にします。
2. SQL Editorで `schema.sql` を実行します。
3. Project Settings → API にあるProject URLとPublishable key（旧anon keyでも可）を、ルートの `supabase-config.js` に設定します。
4. Auth → URL Configurationで公開URLをSite URLに設定し、Redirect URLsにも追加します。
5. 公開後、初回アクセス時に既存localStorageがクラウドへコピーされることを確認します。移行直前の状態は `the-hundred-v2-prototype:pre-cloud-backup` に残ります。

匿名ユーザーもSupabase上では`authenticated`ロールです。テーブルはRLSで本人だけに限定し、友人のWishは`get_friend_wishes`関数が承認済みfriendshipとprivacy settingを確認した後、タイトル・達成状態・許可された達成日だけを返します。メモ、Places、People、手放した理由、履歴、Year Reviewは返しません。

## アカウント化

Guestは匿名Authユーザーとして開始します。メールを追加し、確認リンクを開いた後にパスワードを設定すると、同じ内部user IDのまま恒久アカウントになります。別端末ではそのメールとパスワードでログインします。

## 本番前チェック

- Supabaseのメールテンプレートとリダイレクト先
- Anonymous Sign-InsへのCAPTCHA／レート制限
- RLSの本人・承認済み友人・未承認ユーザーのallow/denyテスト
- バックアップとリストア手順
- Privacy Policyと退会時のデータ削除手順
