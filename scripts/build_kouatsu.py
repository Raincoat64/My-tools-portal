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
    "revisions.js",
    "glossary.js",
    "calculators.js",
    "assistView.js",
    "portability.js",
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
    text = re.sub(r"^export\s+(const|function|async function|class|let|var)\s", r"\1 ", text, flags=re.MULTILINE)
    return text


def js_tokens(source):
    """宣言検査用の字句列。コメント・文字列・正規表現・テンプレート内は除外。"""
    index, previous = 0, ""
    regex_prefix = {"", "=", "(", "[", "{", ",", ":", ";", "!", "?", "=>",
                    "return", "throw", "case", "||", "&&", "??"}
    while index < len(source):
        char = source[index]
        if char.isspace():
            index += 1
            continue
        if source.startswith("//", index):
            end = source.find("\n", index)
            index = len(source) if end < 0 else end
            continue
        if source.startswith("/*", index):
            end = source.find("*/", index + 2)
            if end < 0:
                raise ValueError("閉じていないJavaScriptコメント")
            index = end + 2
            continue
        start = index
        if char in "'\"":
            quote = char
            index += 1
            while index < len(source):
                if source[index] == "\\":
                    index += 2
                elif source[index] == quote:
                    index += 1
                    break
                else:
                    index += 1
            token = "<literal>"
        elif char == chr(96):
            index += 1
            while index < len(source):
                if source[index] == "\\":
                    index += 2
                elif source[index] == chr(96):
                    index += 1
                    break
                elif source.startswith("$" + "{", index):
                    # 入れ子のテンプレートも同じ字句器で読み飛ばす。
                    depth = 1
                    for inner, _, end in js_tokens(source[index + 2:]):
                        if inner == "{":
                            depth += 1
                        elif inner == "}":
                            depth -= 1
                        if depth == 0:
                            index += 2 + end
                            break
                    else:
                        raise ValueError("閉じていないテンプレート式")
                else:
                    index += 1
            token = "<literal>"
        elif char == "/" and previous in regex_prefix:
            index += 1
            character_class = False
            while index < len(source):
                current = source[index]
                if current == "\\":
                    index += 2
                    continue
                if current == "[":
                    character_class = True
                elif current == "]":
                    character_class = False
                elif current == "/" and not character_class:
                    index += 1
                    while index < len(source) and source[index].isalpha():
                        index += 1
                    break
                index += 1
            token = "<literal>"
        else:
            match = re.match(r"(?:[^\W\d]|[$])[\w$]*|\d+(?:\.\d+)?|=>|&&|\|\||\?\?|.", source[index:])
            token = match.group()
            index += len(token)
        yield token, start, index
        previous = token


def binding_names(tokens):
    """const/letの単純名・配列/オブジェクト分割束縛を読む（初期値の識別子は除外）。"""
    def split_top(values, separator):
        pieces, current, depth = [], [], 0
        for value in values:
            if depth == 0 and value == separator:
                pieces.append(current)
                current = []
                continue
            current.append(value)
            if value in ("[", "{", "("):
                depth += 1
            elif value in ("]", "}", ")"):
                depth -= 1
        return pieces + [current]
    tokens = split_top(tokens, "=")[0]
    while tokens and tokens[0] == ".":
        tokens = tokens[1:]
    if not tokens:
        return []
    if tokens[0] in ("[", "{"):
        names = []
        for part in split_top(tokens[1:-1], ","):
            if tokens[0] == "{":
                keyed = split_top(part, ":")
                part = keyed[-1] if len(keyed) > 1 else part
            names.extend(binding_names(part))
        return names
    if len(tokens) == 1 and re.fullmatch(r"(?:[^\W\d]|[$])[\w$]*", tokens[0]):
        return tokens
    raise ValueError("解析できないトップレベル束縛: " + " ".join(tokens))


def top_level_names(source):
    """ブロック・式の内部を除いて宣言される名前を列挙する。"""
    tokens = list(js_tokens(source))
    depths = []
    stack = []
    for token, _, _ in tokens:
        depths.append(len(stack))
        if token in ("{", "(", "["):
            stack.append(token)
        elif token in ("}", ")", "]") and stack:
            stack.pop()
    names = []
    identifier = re.compile(r"(?:[^\W\d]|[$])[\w$]*\Z")
    for index, (token, _, _) in enumerate(tokens):
        if depths[index] != 0:
            continue
        previous = tokens[index - 1][0] if index else ""
        if token in ("function", "class"):
            # 代入式の名前付き関数・クラスは外側の名前空間に宣言しない。
            before = tokens[index - 2][0] if previous == "async" and index > 1 else previous
            if before in ("=", ":", ",", ".", "!", "?", "=>", "return", "await"):
                continue
            offset = 2 if tokens[index + 1][0] == "*" else 1
            if index + offset < len(tokens) and identifier.fullmatch(tokens[index + offset][0]):
                names.append(tokens[index + offset][0])
        elif token in ("const", "let"):
            cursor = index + 1
            while cursor < len(tokens):
                start = cursor
                while cursor < len(tokens) and not (depths[cursor] == 0 and tokens[cursor][0] in ("=", ",", ";")):
                    cursor += 1
                names.extend(binding_names([value[0] for value in tokens[start:cursor]]))
                while cursor < len(tokens) and not (depths[cursor] == 0 and tokens[cursor][0] in (",", ";")):
                    cursor += 1
                if cursor == len(tokens) or tokens[cursor][0] == ";":
                    break
                cursor += 1
    return names


def check_top_level_names(modules):
    origins = {}
    for filename, content in modules:
        for name in top_level_names(content):
            if name in origins:
                raise ValueError(f"トップレベル名の重複: {name} ({origins[name]} / {filename})")
            origins[name] = filename


def build_script_body():
    parts = ['"use strict";\n']
    modules = [(fname, strip_module_syntax((BASE / "js" / fname).read_text(encoding="utf-8"))) for fname in FILES]
    check_top_level_names(modules)
    for fname, content in modules:
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
