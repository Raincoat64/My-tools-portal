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


def normalize(html: str) -> str:
    title = "  <title>住民票字形確認・外字作成支援ツール</title>"
    style = "  <style>"
    start = html.find(title)
    if start < 0:
        raise RuntimeError("title marker not found")
    start += len(title)
    end = html.find(style, start)
    if end < 0:
        raise RuntimeError("style marker not found")

    html = html[:start] + """

  <!--
    v4.3.1-web:
    - 行政事務標準文字68,282字（MJ 58,862字、GJ 9,420字）を検索対象とする。
    - 検索データと表示用公式フォントは同一GitHub Pagesから取得する。
    - 入力文字・入力画像はネットワーク送信せず、永続保存しない。
    - Windows外字が必要な場合は、ブラウザ内でBMP作成までを支援する。
  -->
""" + html[end:]

    pairs = [
        ('<span class="badge safe">● 入力内容・画像は外部送信なし</span>', '<span class="badge safe">入力文字・画像は送信しません</span>', 'privacy badge'),
        ('.sidebar-foot { padding:0 12px 12px; color:var(--muted); font-size:.64rem; }\n', '', 'sidebar-foot css'),
        ('  .sidebar-foot { margin-top:auto; padding:8px 10px; }\n', '', 'compact sidebar-foot css'),
        ('  .sidebar-head, .case-summary, .sidebar-foot { display:none; }', '  .sidebar-head, .case-summary { display:none; }', 'mobile sidebar selector'),
        ('<div class="info-box" id="search-empty-state"><h3>左側に漢字を1文字入力してください</h3><p>候補はここに表示します。</p></div>', '<div class="info-box" id="search-empty-state"><h3>漢字を1文字入力してください</h3></div>', 'search empty state'),
        ('<footer class="step-footer"><span class="footer-hint">通常の文字・IVS候補は「コピー」で利用できます。<br>ツール内表示専用の字形は、その字形から外字を作成できます。</span></footer>', '<footer class="step-footer"><span class="footer-hint">文字・IVSは「コピー」、コピー対象外の字形は「外字にする」を使用します。</span></footer>', 'step1 footer'),
        ('<header class="step-header"><div class="step-title-wrap"><span class="step-number">2</span><div><h2>住民票から対象の1文字だけを取り込む</h2><p>最も簡単なのはWindowsの切り取り機能です。<br>氏名全体ではなく、必要な1文字だけを切り取ってください。</p></div></div><span class="current-step">Step 2 / 4</span></header>', '<header class="step-header"><div class="step-title-wrap"><span class="step-number">2</span><div><h2>住民票から対象の1文字だけを取り込む</h2><p>必要な1文字だけを切り取って貼り付けます。</p></div></div><span class="current-step">Step 2 / 4</span></header>', 'step2 header'),
        ('<div class="info-box maintenance"><h3>紙の住民票しかない場合</h3><p>庁内の適切なスキャン手段で画像化し、対象文字だけを切り出してください。<br>不要な氏名・住所等を画像に含めない運用を推奨します。</p></div>', '<div class="info-box maintenance"><h3>紙の住民票の場合</h3><p>庁内の適切な方法で画像化し、対象文字だけを切り出してください。</p></div>', 'paper guidance'),
        ('<div class="privacy-note"><strong>個人情報の最小化</strong><br>このHTMLは外部送信しませんが、取り込む画像自体も必要な1文字に限定してください。</div>', '<div class="privacy-note"><strong>個人情報の最小化</strong><br>入力画像は送信・永続保存しません。取り込む範囲も必要な1文字に限定してください。</div>', 'image privacy'),
        ('<header class="step-header"><div class="step-title-wrap"><span class="step-number">3</span><div><h2>住民票の字形として読める形に整える</h2><p>黒い線が欠けず、隣の文字や罫線が入っていないことを確認します。<br>通常は初期設定のままで構いません。</p></div></div><span class="current-step">Step 3 / 4</span></header>', '<header class="step-header"><div class="step-title-wrap"><span class="step-number">3</span><div><h2>外字用に字形を整える</h2><p>線切れや余計な文字・罫線がないか確認します。通常は初期設定のままで構いません。</p></div></div><span class="current-step">Step 3 / 4</span></header>', 'step3 header'),
        ('<p class="preview-caption">最終的にWindows外字として登録する字形</p><div class="info-box maintenance"><h3>確認するポイント</h3><p>文字が中央に収まり、線が切れていないこと。<br>背景や隣の文字が残っていないことを確認します。</p></div>', '<p class="preview-caption">Windows外字として登録する字形</p>', 'preview duplicate guidance'),
        ('<div class="info-box"><h3>迷った場合</h3><p>「線の拾い方 128」「全体を収める」「64×64」のまま次へ進んでください。<br>見た目に問題があるときだけ調整します。</p></div>', '', 'default duplicate guidance'),
        ('<header class="step-header"><div class="step-title-wrap"><span class="step-number">4</span><div><h2>Windowsの外字として登録する</h2><p>保存番号を決めます。<br>BMPをペイント経由で外字エディターへ貼り付けます。</p></div></div><span class="current-step">Step 4 / 4</span></header>', '<header class="step-header"><div class="step-title-wrap"><span class="step-number">4</span><div><h2>Windowsの外字として登録する</h2><p>保存番号を決め、BMPをペイント経由で外字エディターへ貼り付けます。</p></div></div><span class="current-step">Step 4 / 4</span></header>', 'step4 header'),
        ('/* =========================================================\n   constants.js / embedded data pack\n   ========================================================= */', '/* =========================================================\n   constants.js / web data pack\n   ========================================================= */', 'data pack comment'),
        ('   characterRepository.js — 配布HTML内の行政事務標準文字データ', '   characterRepository.js — 行政事務標準文字データ', 'repository comment'),
        ('["表示方式", record.src === "GJ" ? "ツール内蔵字形" : candidateKind(record)],', '["表示方式", record.src === "GJ" ? "公式GJフォント" : candidateKind(record)],', 'candidate display mode'),
        ('showToast("この字形は内蔵フォントで正確に描画できないため、住民票等の画像から外字を作成してください。", true);', 'showToast("この字形を表示用フォントで描画できないため、住民票等の画像から外字を作成してください。", true);', 'glyph fallback'),
        ('showToast((record.id || "候補") + " の内蔵字形を外字原稿へ読み込みました。");', 'showToast((record.id || "候補") + " の字形を外字原稿へ読み込みました。");', 'glyph toast'),
        ('if (!force && !stepAccessible(step)) { showToast("先に文字画像を読み込むか、内蔵字形を外字原稿へ読み込んでください。", true); return; }', 'if (!force && !stepAccessible(step)) { showToast("先に文字画像を読み込むか、候補字形を外字原稿へ読み込んでください。", true); return; }', 'step access'),
        ('ui.uploadStatus.textContent = appState.sourceCanvas ? (appState.sourceOrigin ? appState.sourceOrigin + " の内蔵字形を読み込みました。" : "画像を読み込みました。次に字形を確認してください。") : "まだ画像は読み込まれていません。";', 'ui.uploadStatus.textContent = appState.sourceCanvas ? (appState.sourceOrigin ? appState.sourceOrigin + " の字形を読み込みました。" : "画像を読み込みました。次に字形を確認してください。") : "まだ画像は読み込まれていません。";', 'upload status'),
    ]
    for old, new, label in pairs:
        html = replace_once(html, old, new, label)

    html = sub_once(html, r'\n\s*<div class="sidebar-foot">.*?</div>', '', 'sidebar privacy duplicate')
    html = sub_once(
        html,
        r'const APP_META = Object\.freeze\(\{ version: "([^"]+)", build: "[^"]+" \}\);',
        r'const APP_META = Object.freeze({ version: "\1", build: "2026-08-31" });',
        'build metadata',
    )

    old_license = '<p class="small-note"><strong>MJ文字情報一覧表 Ver.006.02：</strong>独立行政法人情報処理推進機構（IPA）の著作物を基にした文字対応メタデータを収録しています。当該派生データ部分は Creative Commons 表示－継承 2.1 日本（CC BY-SA 2.1 JP）に従います。原著作物の案内：<span class="license-uri">https://moji.or.jp/mojikiban/mjlist/</span> ／ ライセンス：<span class="license-uri">https://creativecommons.org/licenses/by-sa/2.1/jp/</span></p><p class="small-note"><strong>IPAmj明朝 Ver.006.01：</strong>公式ファイル <code>ipamjm.ttf</code> の原本バイト列を改変せず可逆圧縮して本HTMLへ内蔵し、実行時にメモリ上へ復元して本HTML内の字形表示にのみ使用します。IPAフォントライセンスv1.0全文を以下に添付しています。</p><p class="small-note"><strong>追加文字行政事務標準明朝：</strong>公式ファイル <code>acgjm.woff2</code> の原本バイト列を改変せず内蔵し、同梱されていた選択可能ライセンスのうち SIL Open Font License 1.1 を採用します。著作権表示およびOFL全文を以下に添付しています。</p>'
    new_license = '<p class="small-note"><strong>MJ文字情報一覧表 Ver.006.02：</strong>IPA原著作物に基づく文字メタデータを使用しています（CC BY-SA 2.1 JP）。出典：<span class="license-uri">https://moji.or.jp/mojikiban/mjlist/</span> ／ ライセンス：<span class="license-uri">https://creativecommons.org/licenses/by-sa/2.1/jp/</span></p><p class="small-note"><strong>IPAmj明朝 Ver.006.01：</strong><code>ipamjm.ttf</code> を無改変のまま可逆圧縮した資材として同一サイトから取得し、ブラウザ内の字形表示に使用します。IPAフォントライセンスv1.0全文は以下のとおりです。</p><p class="small-note"><strong>追加文字行政事務標準明朝：</strong><code>acgjm.woff2</code> を無改変のまま可逆圧縮した資材として同一サイトから取得し、SIL Open Font License 1.1に基づき使用します。著作権表示とOFL全文は以下のとおりです。</p>'
    html = replace_once(html, old_license, new_license, 'license summary')

    old_dataset = 'datasetStatusEl.textContent = `MJ ${Number(src.mjCount || 0).toLocaleString("ja-JP")}字 + GJ ${Number(src.gjCount || 0).toLocaleString("ja-JP")}字を内蔵。候補字形はHTML内に同梱した公式フォント原本から表示します。端末へのフォント導入は不要です。`;'
    new_dataset = 'datasetStatusEl.textContent = `MJ ${Number(src.mjCount || 0).toLocaleString("ja-JP")}字 + GJ ${Number(src.gjCount || 0).toLocaleString("ja-JP")}字。字形表示に必要な公式フォントは同一サイトから読み込みます（端末へのインストール不要）。`;'
    html = replace_once(html, old_dataset, new_dataset, 'dataset status')

    # 現行HTMLに存在しない要素への参照を削除。
    html = html.replace('const datasetBadgeEl = document.getElementById("dataset-badge");\n', '')
    html = re.sub(r'\n\s*if \(datasetBadgeEl\) datasetBadgeEl\.textContent = "[^"]*";', '', html)

    # 同一定義が2回あるため、後の定義だけ削除。
    duplicate_fn = '''function showManualCopyFallback(text) {
  manualCopyRowEl.hidden = false;
  manualCopyInputEl.value = text;
  manualCopyInputEl.focus();
  manualCopyInputEl.select();
}
'''
    positions = [m.start() for m in re.finditer(re.escape(duplicate_fn), html)]
    if len(positions) != 2:
        raise RuntimeError(f"showManualCopyFallback: expected 2 definitions, found {len(positions)}")
    second = positions[1]
    html = html[:second] + html[second + len(duplicate_fn):]

    for phrase in [
        'kyujitai.js',
        '単一HTMLで配布可能',
        '本HTMLへ内蔵',
        'HTML内に同梱した公式フォント',
        'ツール内蔵字形',
        '内蔵フォントで正確に描画',
        ' の内蔵字形を',
    ]:
        if phrase in html:
            raise RuntimeError(f"stale phrase remains: {phrase}")

    for phrase in [
        'IPA Font License Agreement v1.0',
        'SIL OPEN FONT LICENSE Version 1.1',
        '入力文字・画像は送信しません',
        '入力画像は送信・永続保存しません',
        "connect-src 'self'",
        'fetchGzipAsset',
    ]:
        if phrase not in html:
            raise RuntimeError(f"required phrase missing: {phrase}")

    if html.count('function showManualCopyFallback(text)') != 1:
        raise RuntimeError('duplicate showManualCopyFallback remains')

    return html


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('html')
    ap.add_argument('report')
    args = ap.parse_args()

    html_path = Path(args.html)
    report_path = Path(args.report)
    html_path.write_text(normalize(html_path.read_text('utf-8')), 'utf-8')

    report = json.loads(report_path.read_text('utf-8'))
    report['files']['gaiji-maker.html'] = {
        'size': html_path.stat().st_size,
        'sha256': sha256_file(html_path),
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    print(f"normalized {html_path}: {html_path.stat().st_size} bytes")


if __name__ == '__main__':
    main()
