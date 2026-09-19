"""
index.html を唯一の画面テンプレートとして、CSS・JSを単体HTMLへ埋め込む。

js/*.js は ES モジュール(import/export)前提で書かれているが、standalone 版は
モジュール無しの単一 <script> にまとめる必要があるため、import 文と export
プレフィックスを機械的に取り除いて連結する。手動 Edit の積み重ねだと大きな
変更のときに不整合(重複関数など)を起こしやすいため、必ずこのスクリプトで
再生成すること。

使い方: Python 3.9以上で `python scripts/build_kouatsu.py` を実行する
(Windows では実際のバージョンを確認し、必要ならPython 3.9以上のexeを明示する)。

FILES の並び順が依存関係の順序(constants → api/storage/lawTree → render →
diagnosis → procedures → procedureView → main)になっている点に注意。新しいファイルを追加した場合はここに
追記する。
"""

import re
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "src" / "kouatsu"

FILES = [
    "constants.js",
    "api.js",
    "storage.js",
    "lawTree.js",
    "render.js",
    "diagnosis.js",
    "procedures.js",
    "procedureView.js",
    "main.js",
]

# standalone/ 配下の .html を1つ想定(複数ある場合はここを配列に変えて回す)
STANDALONE_HTML = ROOT / "tools" / "kouatsu-gas-law-viewer.html"
CSS_FILE = BASE / "css" / "style.css"


def strip_module_syntax(text):
    # 複数行 import { ... } from "...";
    text = re.sub(r'^import\s*\{[^}]*\}\s*from\s*"[^"]*";\s*\n', "", text, flags=re.MULTILINE)
    # 単一行 import x from "...";(念のため)
    text = re.sub(r'^import\s+\S+\s+from\s*"[^"]*";\s*\n', "", text, flags=re.MULTILINE)
    # 末尾の export { ... }; ブロック(diagnosis.js のような集約export)
    text = re.sub(r"\nexport\s*\{[^}]*\};\s*\n?$", "\n", text)
    # export const/function/async function/let/var の "export " プレフィックスのみ除去
    text = re.sub(r"^export\s+(const|function|async function|let|var)\s", r"\1 ", text, flags=re.MULTILINE)
    return text


def build_script_body():
    parts = ['"use strict";\n']
    for fname in FILES:
        content = (BASE / "js" / fname).read_text(encoding="utf-8")
        content = strip_module_syntax(content)
        parts.append(
            f"\n/* =========================================================\n"
            f"   {fname}\n"
            f"   ========================================================= */\n\n"
            f"{content.rstrip()}\n"
        )
    return "".join(parts)


def main():
    parser = argparse.ArgumentParser(description="高圧ガスの公開HTMLを生成・照合")
    parser.add_argument("--check", action="store_true", help="生成物がソースと一致するか確認（書込なし）")
    args = parser.parse_args()
    html = (BASE / "index.html").read_text(encoding="utf-8")
    css_content = CSS_FILE.read_text(encoding="utf-8")
    css_marker = '<link rel="stylesheet" href="./css/style.css" />'
    script_marker = '<script type="module" src="./js/main.js"></script>'
    if html.count(css_marker) != 1 or html.count(script_marker) != 1:
        raise ValueError("index.html のCSS・JS読込位置を一意に特定できません")
    html = html.replace(css_marker, "<style>\n" + css_content.rstrip() + "\n  </style>")
    script_body = build_script_body()
    html = html.replace(script_marker, "<script>\n" + script_body.replace("</script", "<\\/script") + "\n  </script>")
    if args.check:
        if not STANDALONE_HTML.exists() or STANDALONE_HTML.read_bytes() != html.encode("utf-8"):
            raise SystemExit("配布HTMLとソースが不一致です。再生成してください。")
        print("PASS: 配布HTMLとソースが一致")
        return
    STANDALONE_HTML.parent.mkdir(exist_ok=True)
    with STANDALONE_HTML.open("w", encoding="utf-8", newline="\n") as output:
        output.write(html)
    print(f"synced {STANDALONE_HTML} ({len(html)} chars)")


if __name__ == "__main__":
    main()
