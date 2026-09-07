# My-tools-portal 技術資料

2026-09-07のGitHub mainのコード・workflowを確認した構成。ローカルの古い製品コードとは版が異なる場合がある。以下のコマンドは対応するスクリプトがあるcheckoutを対象とする。

## 構成

- 静的サイト＋PWA。入口はindex.html、オフラインキャッシュはsw.js、ツールはtools/。
- すべてのツールが単一HTML・ビルド不要という旧説明は現行には当てはまらない。
- 高圧ガスツールはsrc/kouatsu/をscripts/build_kouatsu.pyで配布HTMLへ生成する。製品仕様・法令根拠は同ディレクトリのREADMEに記録される。
- 外字Web版にはtools/gaiji-maker-assets/のデータとtools/gaiji-maker-source/の生成処理がある。Web版と単体配布版を区別する。

## 実行方法

- ローカル閲覧: `python -m http.server 8931`。
- 高圧ガス配布物の生成: `python scripts/build_kouatsu.py`。確認: `node --test tests/kouatsu.test.cjs`。
- 外字Web版の生成手順と依存は.github/workflows/build-gaiji-web.ymlにある。
- 外字単体版: `python tools/gaiji-maker-source/build_standalone.py --web-html tools/gaiji-maker.html --assets-dir tools/gaiji-maker-assets --output <出力HTML>`。対応workflowは.github/workflows/build-gaiji-standalone.yml。
- ビルドは生成物を書き換える。今回の文書整理では製品ビルド・公開処理は実行していない。

## 維持する製品上の条件

- 日本語UI、既存CSS変数とdark mode、同梱データのライセンス。
- Web版と単体配布版それぞれの動作条件。利用者へ渡す配布物が検証対象と同じであること。
- 外字のcode pointやIVS検出の推定を確定情報として表示しない。
- 旧CLAUDE.mdにあったBMP・IME辞書の観測や過去の試行はarchive/2026-09-07-unification/CLAUDE.md.txtに保存される。当時の結果を恒久的な禁止や現行の検証済み事実にしない。
