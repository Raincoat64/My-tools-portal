# My-tools-portal 技術資料

2026-09-07のGitHub mainのコード・workflowを確認した構成。ローカルの古い製品コードとは版が異なる場合がある。以下のコマンドは対応するスクリプトがあるcheckoutを対象とする。

## 構成

- 静的サイト＋PWA。入口はindex.html、オフラインキャッシュはsw.js、ツールはtools/。
- すべてのツールが単一HTML・ビルド不要という旧説明は現行には当てはまらない。
- 高圧ガスツールはsrc/kouatsu/をscripts/build_kouatsu.pyで配布HTMLへ生成する。製品仕様・法令根拠は同ディレクトリのREADMEに記録される。
- 外字Web版にはtools/gaiji-maker-assets/のデータとtools/gaiji-maker-source/の生成処理がある。Web版と単体配布版を区別する。
- PaperMirror-JP は tools/papermirror-jp/ の静的アプリ。MuPDF.js 1.28.1 の Web Worker で PDF を処理し、翻訳は外部 AI と JSON を受け渡す。使い方は同フォルダーの README.html、AGPL ライセンスは LICENSE.txt、対応するアプリソースと再ビルド手順は source.zip に同梱する。

## 実行方法

- ローカル閲覧: `python -m http.server 8931`。
- 高圧ガス配布物の生成: `python scripts/build_kouatsu.py`。生成一致: `python scripts/build_kouatsu.py --check`。確認: `node --test tests/kouatsu-*.test.mjs`。ブラウザー検証はsrc/kouatsu/README.md参照。
- 外字Web版の生成手順と依存は.github/workflows/build-gaiji-web.ymlにある。
- 外字単体版: `python tools/gaiji-maker-source/build_standalone.py --web-html tools/gaiji-maker.html --assets-dir tools/gaiji-maker-assets --output <出力HTML>`。対応workflowは.github/workflows/build-gaiji-standalone.yml。
- PaperMirror-JP の更新: source.zip を別の作業フォルダーに展開し `node scripts/build-web.mjs`。生成した `_site/` の内容を tools/papermirror-jp/ に配置する。公開サイトには PDF 原稿や作業ファイルを置かない。ソース ZIP 内の Pages workflow は単独リポジトリ用で、このポータルの既存公開設定には追加しない。
- ビルドは生成物を書き換える。今回の文書整理では製品ビルド・公開処理は実行していない。

## 維持する製品上の条件

- 日本語UI、既存CSS変数とdark mode、同梱データのライセンス。
- Web版と単体配布版それぞれの動作条件。利用者へ渡す配布物が検証対象と同じであること。
- 外字のcode pointやIVS検出の推定を確定情報として表示しない。
- 旧CLAUDE.mdにあったBMP・IME辞書の観測や過去の試行はarchive/2026-09-07-unification/CLAUDE.md.txtに保存される。当時の結果を恒久的な禁止や現行の検証済み事実にしない。
