#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 occurrence, found {n}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, repl: str, label: str) -> str:
    text, n = re.subn(pattern, repl, text, count=1, flags=re.S)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {n}")
    return text


def prune(html: str) -> str:
    # 未使用CSS変数・旧UIセレクタ。
    html = replace_once(html, "  --danger-soft: #fff1ef;\n", "", "unused danger-soft")
    html = replace_once(html, ".step-nav-button.skip { opacity:.58; }\n", "", "unused skip style")
    html = replace_once(html, "code, .shortcut {", "code {", "unused shortcut alias")

    old_buttons = '''.primary-button, .secondary-button, .ghost-button, .chip-btn, .btn-chip, .btn-primary, .btn-secondary, .source-action {
  border-radius:8px; cursor:pointer; min-height:38px; padding:7px 13px; font-weight:700; font-size:.8rem;
}
.primary-button, .btn-primary, .source-action.primary { border:1px solid var(--brand); background:var(--brand); color:#fff; }
.primary-button:hover, .btn-primary:hover, .source-action.primary:hover { background:var(--brand-hover); }
.secondary-button, .btn-secondary, .source-action { border:1px solid var(--line-strong); background:#fff; }
.secondary-button:hover, .btn-secondary:hover, .source-action:hover { background:var(--surface-subtle); }
.ghost-button, .btn-chip { border:1px solid var(--line); background:var(--surface-subtle); }
'''
    new_buttons = '''.primary-button, .secondary-button, .ghost-button {
  border-radius:8px; cursor:pointer; min-height:38px; padding:7px 13px; font-weight:700; font-size:.8rem;
}
.primary-button { border:1px solid var(--brand); background:var(--brand); color:#fff; }
.primary-button:hover { background:var(--brand-hover); }
.secondary-button { border:1px solid var(--line-strong); background:#fff; }
.secondary-button:hover { background:var(--surface-subtle); }
.ghost-button { border:1px solid var(--line); background:var(--surface-subtle); }
'''
    html = replace_once(html, old_buttons, new_buttons, "legacy button aliases")

    html = sub_once(
        html,
        r'\.search-guidance \{.*?\.guide-num \{.*?\}\n',
        '',
        'unused search guidance styles',
    )
    html = sub_once(
        html,
        r'\.char-list \{.*?\.chip-btn\.copy-action \{.*?\}\n',
        '',
        'unused old character-chip styles',
    )
    html = sub_once(
        html,
        r'\.font-compare-grid \{.*?\.priority-search-card\.needs-attention \{.*?\}\n',
        '',
        'unused font-compare/priority styles',
    )
    html = sub_once(
        html,
        r'\.precision-results \{.*?\.precision-results h3::before \{.*?\}\n',
        '',
        'unused precision-result styles',
    )
    html = replace_once(
        html,
        '.candidate-card.is-dev .candidate-glyph-wrap { background:repeating-linear-gradient(135deg,#fff,#fff 8px,#fbfbfb 8px,#fbfbfb 16px); }\n',
        '',
        'unused seed candidate style',
    )
    html = replace_once(
        html,
        '.dataset-card.dev { border-color:var(--amber-line); background:var(--amber-soft); }\n',
        '',
        'unused seed dataset style',
    )
    html = replace_once(html, '  .card, .panel { padding-left:10px; padding-right:10px; }\n', '', 'unused mobile card aliases')

    # v4.3レスポンシブ規則より前に残っていた旧ブレークポイントは後段で完全に上書きされる。
    html = sub_once(
        html,
        r'@media \(max-width: 1180px\) \{\n  body \{ min-width: 0; \}.*?\n\}\n@media \(max-width: 900px\) \{.*?\n\}\n(?=@media \(prefers-reduced-motion)',
        '',
        'superseded responsive blocks',
    )

    # Web版では常に同一Pages上のgzip資材を読むため、埋込み/seed互換経路を削除。
    html = sub_once(
        html,
        r'function b64Bytes\(b64\) \{.*?(?=async function fetchGzipAsset\(url\))',
        '',
        'embedded-data helpers',
    )

    repository = '''const CharacterRepository = {
  ready: false,
  records: [],
  features: new Uint8Array(),
  featureDim: 0,
  relations: {},
  seqMap: new Map(),
  baseMap: new Map(),
  source: {},
  async init(pack) {
    this.featureDim = Number(pack.featureDim || 0);
    this.source = pack.source || {};
    const [recordsBytes, featuresBytes, relationsBytes] = await Promise.all([
      fetchGzipAsset(pack.recordsUrl),
      fetchGzipAsset(pack.featuresUrl),
      fetchGzipAsset(pack.relationsUrl),
    ]);
    this.records = JSON.parse(new TextDecoder("utf-8").decode(recordsBytes));
    this.features = featuresBytes;
    this.relations = JSON.parse(new TextDecoder("utf-8").decode(relationsBytes)) || {};
    this.records.forEach((r, i) => {
      r.i = Number.isInteger(r.i) ? r.i : i;
      if (r.seq) {
        const key = sequenceKey(r.seq);
        if (!this.seqMap.has(key)) this.seqMap.set(key, []);
        this.seqMap.get(key).push(r.i);
      }
      if (r.base) {
        const key = sequenceKey(r.base);
        if (!this.baseMap.has(key)) this.baseMap.set(key, []);
        this.baseMap.get(key).push(r.i);
      }
    });
    this.ready = true;
  },
  record(index) { return this.records[index] || null; },
  exact(text) { return this.seqMap.get(sequenceKey(text)) || []; },
  sameBase(text) {
    const b = Array.from(text || "")[0] || "";
    return this.baseMap.get(sequenceKey(b)) || [];
  },
};
'''
    html = sub_once(
        html,
        r'const CharacterRepository = \{.*?\n\};\n(?=\n/\* =========================================================\n   glyphProvider\.js)',
        repository,
        'web-only character repository',
    )

    old_font_load = '''    let bytes;
    if (spec.url) bytes=await fetchGzipAsset(spec.url);
    else if (spec.gz) bytes=await gunzipBytes(spec.gz);
    else throw new Error("表示用フォントを取得できません。");
'''
    html = replace_once(
        html,
        old_font_load,
        '    if (!spec.url) throw new Error("表示用フォントのURLがありません。");\n    const bytes=await fetchGzipAsset(spec.url);\n',
        'embedded-font fallback',
    )

    html = replace_once(
        html,
        '  card.className = "candidate-card" + (record.src === "GJ" ? " is-gj" : "") + (CharacterRepository.mode === "seed" ? " is-dev" : "");',
        '  card.className = "candidate-card" + (record.src === "GJ" ? " is-gj" : "");',
        'seed candidate class',
    )
    html = replace_once(
        html,
        '["区分", record.src === "GJ" ? "GJ追加文字" : record.src === "MJ" ? "MJ文字" : "開発用データ"],',
        '["区分", record.src === "GJ" ? "GJ追加文字" : "MJ文字"],',
        'development data label',
    )

    dataset_ui = '''function updateDatasetUi() {
  const count = CharacterRepository.records.length;
  const src = CharacterRepository.source || {};
  datasetTitleEl.textContent = "行政事務標準文字";
  datasetCountEl.textContent = count.toLocaleString("ja-JP") + "字";
  datasetStatusEl.textContent = `MJ ${Number(src.mjCount || 0).toLocaleString("ja-JP")}字 + GJ ${Number(src.gjCount || 0).toLocaleString("ja-JP")}字。字形表示に必要な公式フォントは同一サイトから読み込みます（端末へのインストール不要）。`;
}
'''
    html = sub_once(
        html,
        r'function updateDatasetUi\(\) \{.*?\n\}\n(?=\n/\* =========================================================\n   events\.js)',
        dataset_ui,
        'web-only dataset UI',
    )

    html = replace_once(
        html,
        '    btn.classList.remove("done", "active", "skip", "is-current");',
        '    btn.classList.remove("done", "active", "is-current");',
        'unused skip state',
    )

    forbidden = [
        '.char-list', '.font-compare-grid', '.priority-search-card', '.precision-results',
        '.search-guidance', '.candidate-card.is-dev', '.dataset-card.dev',
        'CharacterRepository.mode', 'mode === "seed"', 'recordsGz', 'featuresGz',
        'relationsGz', 'spec.gz', 'b64Bytes', 'gunzipBytes', 'gunzipJson',
        '開発用データ', '.step-nav-button.skip', '.btn-primary', '.source-action', '.btn-chip',
    ]
    for phrase in forbidden:
        if phrase in html:
            raise RuntimeError(f"obsolete content remains: {phrase}")

    required = [
        'external-web', 'fetchGzipAsset(pack.recordsUrl)', 'fetchGzipAsset(spec.url)',
        'IPA Font License Agreement v1.0', 'SIL OPEN FONT LICENSE Version 1.1',
        'function showManualCopyFallback(text)', 'candidate-card',
    ]
    for phrase in required:
        if phrase not in html:
            raise RuntimeError(f"required content missing: {phrase}")

    return html


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('html')
    ap.add_argument('report')
    args = ap.parse_args()

    html_path = Path(args.html)
    report_path = Path(args.report)
    html_path.write_text(prune(html_path.read_text('utf-8')), 'utf-8')

    report = json.loads(report_path.read_text('utf-8'))
    report['files']['gaiji-maker.html'] = {
        'size': html_path.stat().st_size,
        'sha256': sha256_file(html_path),
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(f"pruned {html_path}: {html_path.stat().st_size} bytes")


if __name__ == '__main__':
    main()
