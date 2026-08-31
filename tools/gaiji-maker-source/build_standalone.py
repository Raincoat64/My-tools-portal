#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import re
from pathlib import Path

DIST_VERSION = "4.3.1-dist"
EXPECTED_RECORDS = 68282
EXPECTED_FEATURE_DIM = 168


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--web-html", required=True)
    ap.add_argument("--assets-dir", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    web_html = Path(args.web_html)
    assets = Path(args.assets_dir)
    output = Path(args.output)

    html = web_html.read_text("utf-8")

    # Validate the current generated data before embedding it.
    records_gz = (assets / "records.pack").read_bytes()
    features_gz = (assets / "features.pack").read_bytes()
    relations_gz = (assets / "relations.pack").read_bytes()
    records = json.loads(gzip.decompress(records_gz).decode("utf-8"))
    features = gzip.decompress(features_gz)
    relations = json.loads(gzip.decompress(relations_gz).decode("utf-8"))
    if len(records) != EXPECTED_RECORDS:
        raise RuntimeError(f"record count mismatch: {len(records)}")
    if len(features) != EXPECTED_RECORDS * EXPECTED_FEATURE_DIM:
        raise RuntimeError(f"feature size mismatch: {len(features)}")
    target = next((r for r in records if r.get("id") == "MJ024527"), None)
    if not target:
        raise RuntimeError("MJ024527 missing")

    m = re.search(r"const ADMIN_CHAR_DATA_PACK = (\{.*?\});\n", html)
    if not m:
        raise RuntimeError("ADMIN_CHAR_DATA_PACK not found")
    web_pack = json.loads(m.group(1))
    source = web_pack.get("source") or {}

    embedded_pack = {
        "format": 4,
        "mode": "embedded-single",
        "source": source,
        "recordCount": EXPECTED_RECORDS,
        "featureDim": EXPECTED_FEATURE_DIM,
        "recordsGz": base64.b64encode(records_gz).decode("ascii"),
        "featuresGz": base64.b64encode(features_gz).decode("ascii"),
        "relationsGz": base64.b64encode(relations_gz).decode("ascii"),
        "fonts": {
            "mj": {
                "format": "truetype",
                "gz": b64(assets / "ipamjm.pack"),
            },
            "gj": {
                "format": "woff2",
                "gz": b64(assets / "acgjm.pack"),
            },
        },
    }
    pack_js = json.dumps(embedded_pack, ensure_ascii=False, separators=(",", ":"))
    html = html[:m.start(1)] + pack_js + html[m.end(1):]

    # Distribution edition: no runtime network access is needed.
    html = html.replace("connect-src 'self'", "connect-src 'none'")
    html = html.replace("4.3.1-web", DIST_VERSION)
    html = html.replace("constants.js / web data pack", "constants.js / embedded distribution data pack")

    html = html.replace(
        "- 検索データと表示用公式フォントは同一GitHub Pagesから取得する。",
        "- 検索データと表示用公式フォントを本HTML内に格納し、外部資材を取得しない。",
    )
    html = html.replace(
        "- 入力文字・入力画像はネットワーク送信せず、永続保存しない。",
        "- 入力文字・入力画像はネットワーク送信せず、永続保存しない。配布版は実行時通信を行わない。",
    )

    html = html.replace(
        '<p class="small-note"><strong>IPAmj明朝 Ver.006.01：</strong><code>ipamjm.ttf</code> を無改変のまま可逆圧縮した資材として同一サイトから取得し、ブラウザ内の字形表示に使用します。IPAフォントライセンスv1.0全文は以下のとおりです。</p>',
        '<p class="small-note"><strong>IPAmj明朝 Ver.006.01：</strong><code>ipamjm.ttf</code> を無改変のまま可逆圧縮して本HTML内に格納し、ブラウザ内の字形表示にのみ使用します。端末へのフォントインストールは不要です。IPAフォントライセンスv1.0全文は以下のとおりです。</p>',
    )
    html = html.replace(
        '<p class="small-note"><strong>追加文字行政事務標準明朝：</strong><code>acgjm.woff2</code> を無改変のまま可逆圧縮した資材として同一サイトから取得し、SIL Open Font License 1.1に基づき使用します。著作権表示とOFL全文は以下のとおりです。</p>',
        '<p class="small-note"><strong>追加文字行政事務標準明朝：</strong><code>acgjm.woff2</code> を無改変のまま可逆圧縮して本HTML内に格納し、ブラウザ内の字形表示にのみ使用します。SIL Open Font License 1.1に基づき使用し、著作権表示とOFL全文は以下のとおりです。</p>',
    )

    old_loader = '''async function fetchGzipAsset(url) {
  if (!url) throw new Error("文字データのURLがありません。");
  const response = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
  if (!response.ok) throw new Error(`文字データを取得できませんでした (${response.status})`);
  if (typeof DecompressionStream === "undefined") throw new Error("このブラウザは文字データの展開に対応していません。OS・ブラウザを更新してください。");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
'''
    new_loader = '''function decodeBase64Bytes(value) {
  if (!value) throw new Error("内蔵データがありません。");
  const raw = atob(value);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function gunzipEmbeddedAsset(value) {
  if (typeof DecompressionStream === "undefined") throw new Error("このブラウザは内蔵文字データの展開に対応していません。OS・ブラウザを更新してください。");
  const compressed = decodeBase64Bytes(value);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
'''
    html = replace_once(html, old_loader, new_loader, "embedded loader")

    old_repo = '''    const [recordsBytes, featuresBytes, relationsBytes] = await Promise.all([
      fetchGzipAsset(pack.recordsUrl),
      fetchGzipAsset(pack.featuresUrl),
      fetchGzipAsset(pack.relationsUrl),
    ]);
'''
    new_repo = '''    const [recordsBytes, featuresBytes, relationsBytes] = await Promise.all([
      gunzipEmbeddedAsset(pack.recordsGz),
      gunzipEmbeddedAsset(pack.featuresGz),
      gunzipEmbeddedAsset(pack.relationsGz),
    ]);
'''
    html = replace_once(html, old_repo, new_repo, "repository embedded loading")

    old_font = '''    if (!spec.url) throw new Error("表示用フォントのURLがありません。");
    const bytes=await fetchGzipAsset(spec.url);
'''
    new_font = '''    if (!spec.gz) throw new Error("内蔵表示用フォントがありません。");
    const bytes=await gunzipEmbeddedAsset(spec.gz);
'''
    html = replace_once(html, old_font, new_font, "font embedded loading")

    old_dataset = '  datasetStatusEl.textContent = `MJ ${Number(src.mjCount || 0).toLocaleString("ja-JP")}字 + GJ ${Number(src.gjCount || 0).toLocaleString("ja-JP")}字。字形表示に必要な公式フォントは同一サイトから読み込みます（端末へのインストール不要）。`;'
    new_dataset = '  datasetStatusEl.textContent = `MJ ${Number(src.mjCount || 0).toLocaleString("ja-JP")}字 + GJ ${Number(src.gjCount || 0).toLocaleString("ja-JP")}字。検索データと表示用公式フォントを本HTML内に格納しています（端末へのインストール不要）。`;'
    html = replace_once(html, old_dataset, new_dataset, "dataset status")

    # Final invariants for the standalone edition.
    forbidden = [
        "fetch(",
        "connect-src 'self'",
        "recordsUrl",
        "featuresUrl",
        "relationsUrl",
        "表示用フォントのURL",
        "同一サイトから読み込みます",
    ]
    for token in forbidden:
        if token in html:
            raise RuntimeError(f"standalone HTML still contains forbidden token: {token}")
    required = [
        "connect-src 'none'",
        '"mode":"embedded-single"',
        "gunzipEmbeddedAsset",
        "IPAフォントライセンスv1.0 全文",
        "SIL Open Font License 1.1 全文・著作権表示",
        "MJ024527",
    ]
    for token in required:
        if token not in html:
            raise RuntimeError(f"standalone HTML missing required token: {token}")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, "utf-8")
    out_bytes = output.read_bytes()
    print(json.dumps({
        "version": DIST_VERSION,
        "records": len(records),
        "featureDim": EXPECTED_FEATURE_DIM,
        "relations": len(relations),
        "output": str(output),
        "size": len(out_bytes),
        "sha256": sha256_bytes(out_bytes),
        "networkFetch": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
