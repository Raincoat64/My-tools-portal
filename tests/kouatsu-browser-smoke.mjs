// ブラウザーとPlaywrightは検証環境のものを使用。アプリ本体の依存関係ではない。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NAV_PLAYWRIGHT_PATH || 'playwright');
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer(async (req, res) => {
  try {
    const rawPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!rawPath.startsWith('/My-tools-portal/')) { res.writeHead(404); res.end(); return; }
    const pathname = rawPath.slice('/My-tools-portal'.length);
    const target = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    const content = await fs.readFile(target);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' })[path.extname(target)] || 'application/octet-stream' }); res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}/My-tools-portal`;
const browser = await chromium.launch(process.env.NAV_BROWSER_PATH ? { executablePath: process.env.NAV_BROWSER_PATH, headless: true } : { headless: true });
const published = `${origin}/tools/kouatsu-gas-law-viewer.html`;
const urls = [origin + '/src/kouatsu/index.html', published, new URL('../tools/kouatsu-gas-law-viewer.html', import.meta.url).href];
let assertions = 0;
const check = (value, label) => { assert.ok(value, label); assertions++; };
const fixtureNode = (tag, children, attr = {}) => ({ tag, children, attr });
const fixtureArticle = fixtureNode('Article', [fixtureNode('ArticleTitle', ['第一条']), fixtureNode('Paragraph', [fixtureNode('ParagraphSentence', [fixtureNode('Sentence', ['検証用の本文です。'])])], { Num: '1' })], { Num: '1' });
const fixtureChapter = fixtureNode('Chapter', [fixtureNode('ChapterTitle', ['第一章 検証']), fixtureArticle], { Num: '1' });
const fixture = { law_full_text: fixtureNode('Law', [fixtureNode('LawBody', [fixtureNode('LawTitle', ['検証用法令']), fixtureNode('MainProvision', [fixtureChapter])])]) };
try {
  for (const url of urls) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await context.route('https://**/*', route => route.abort());
    await context.route('https://laws.e-gov.go.jp/**', route => route.abort());
    await page.goto(url);
    await page.getByRole('heading', { name: /必要な手続きから/ }).waitFor();
    check(await page.locator('.purpose-option').count() === 6, 'ホームの六つの目的');
    check(!await page.locator('.history-panel').evaluate(e => e.open), '履歴は折りたたみ');
    await page.getByRole('button', { name: /^新しく始める/ }).click();
    await page.getByRole('button', { name: /^販売 高圧ガス/ }).click();
    await page.getByRole('button', { name: /^一般の高圧ガス/ }).click();
    await page.getByRole('button', { name: /^いいえ\(例外/ }).click();
    await page.getByRole('button', { name: /^いいえ\(第二種/ }).click();
    await page.locator('[data-procedure-id="sales-new-general"]').waitFor();
    check((await page.locator('.download-link').first().getAttribute('href')).endsWith('20260128160748.docx'), '一般則の様式');

    // バナー・外部リンク・見出しは、実際の結果画面の計算済みスタイルで確認。
    const visual = await page.evaluate(() => {
      const banner = document.querySelector('.verdict-banner'), original = banner.className;
      const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(v => v/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
      const colors = ['permit','notification','none','other_law','invalid','needs_confirmation'].map(verdict => {
        banner.className = 'verdict-banner ' + verdict;
        const bg = getComputedStyle(banner).backgroundColor;
        return { verdict, bg, ratios: [...banner.querySelectorAll('h3,p')].map(e=>contrast(getComputedStyle(e).color,bg)) };
      });
      banner.className = original;
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(e=>Number(e.tagName[1]));
      return { colors, hierarchy: headings.every((n,i)=>i===0 || n-headings[i-1]<=1),
        links: [...document.querySelectorAll('a[target="_blank"]')].every(e=>e.querySelector('.sr-only')?.textContent.includes('新しいタブで開きます') && getComputedStyle(e.querySelector('.sr-only')).clipPath === 'inset(50%)') };
    });
    check(new Set(visual.colors.slice(0,3).map(c=>c.bg)).size === 3, '許可・届出・対象外の背景を区別');
    check(visual.colors.every(c=>c.ratios.every(r=>r>=4.5)), '全判定バナー本文・見出しのコントラスト4.5以上');
    check(visual.hierarchy, '診断結果の見出し階層を飛ばさない');
    check(visual.links, 'すべての別タブ外部リンクに視覚的に隠した読み上げ文');

    await page.locator('[data-document-id="form"]').check();
    await page.locator('#fact-sales-new-general-structure').selectOption('no');
    check(await page.locator('[data-document-id="form"]').isChecked(), '条件変更でも無関係のチェックは保持');
    check(await page.locator('[data-document-id="structure"]').isDisabled(), '伝票販売の書類対象外');
    check(await page.locator('[data-document-id="storage-standard"]').isDisabled(), '同じ条件の資料も連動');
    await page.reload(); await page.getByRole('button', { name: '続きから再開', exact: true }).click();
    check(await page.locator('[data-document-id="form"]').isChecked(), 'チェック保存・復元');
    check(await page.locator('#fact-sales-new-general-structure').inputValue() === 'no', '条件保存・復元');
    await page.getByText('判定の根拠条文・技術基準', { exact: true }).click();
    await page.locator('.citation-toggle').filter({ hasText: '第20条の4' }).first().click();
    await page.getByText('条文を取得できませんでした。申請案内は引き続き利用できます。', { exact: true }).waitFor();
    check(await page.locator('.download-link').count() === 3, 'API失敗中も公式資料リンクを利用可能');
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'スマートフォン幅に収まる');
    await page.emulateMedia({ media: 'print' }); await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    check(await page.locator('.answer-summary').evaluate(e => e.open), '印刷に回答内容を含める');
    check(await page.locator('.guide-print-date').isVisible() && (await page.locator('.guide-print-date').innerText()).includes('2026-09-19'), '定数由来の確認日を印刷表示');
    check(await page.locator('.mode-tabs').evaluate(e => getComputedStyle(e).display === 'none'), '印刷にナビ操作を含めない');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await page.emulateMedia({ media: 'screen' });
    await page.locator('.mode-tab[data-mode="home"]').click();
    await page.getByRole('button', { name: /^施設・ガス・会社情報/ }).click();
    for (const text of ['製造', '一般則', '第二種製造者（届出）', '施設・設備の工事（取替え・撤去等）', '独立した設備の撤去のみ', 'はい', 'はい']) await page.getByRole('button', { name: text, exact: true }).click();
    check(await page.locator('[data-procedure-id="minor-report"]').count() === 1, '第二種の軽微変更でも県報告へ案内');
    await page.locator('.answer-summary summary').click(); await page.locator('.answer-row').filter({ hasText: '現在の許可・届出区分は？' }).getByRole('button', { name: '修正' }).click();
    check(await page.getByRole('heading', { name: '現在の許可・届出区分は？' }).isVisible(), '回答修正で後続分岐を戻す');
    await page.getByRole('button', { name: '第一種製造者（許可）', exact: true }).click();
    check(await page.getByRole('heading', { name: '何を変更しますか？' }).isVisible(), '変更後の条件を再質問');
    await page.locator('.mode-tab[data-mode="catalogue"]').click();
    await page.locator('#procedure-search').fill('販売'); await page.getByRole('button', { name: '検索する', exact: true }).click();
    await page.locator('#filter-regulation').selectOption('refrigeration'); await page.locator('#filter-purpose').selectOption('new');
    check(await page.locator('.procedure-row').count() === 1, '検索と規則フィルター');
    await page.locator('.procedure-row').click();
    check((await page.locator('.download-link').first().getAttribute('href')).endsWith('20260128160748_2.docx'), '冷凍則の正しい様式');
    check(await page.locator('[data-document-id="container-register"]').count() === 0, '冷凍販売で不要な帳簿を要求しない');
    await page.setViewportSize({ width: 1366, height: 1000 }); await page.evaluate(() => document.documentElement.style.zoom = '2');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '200%拡大で横にはみ出さない');
    await page.evaluate(() => document.documentElement.style.zoom = '1');
    await page.locator('.mode-tab[data-mode="home"]').focus(); await page.keyboard.press('Enter');
    check(await page.getByRole('heading', { name: /必要な手続きから/ }).isVisible(), 'キーボードからホームへ移動');

    // 明示的に残した未確認結果は、再評価による汎用invalidに置換しない。
    await page.getByRole('button', { name: /^新しく始める/ }).click();
    await page.getByRole('button', { name: /^貯蔵 / }).click();
    await page.getByRole('button', { name: /^冷凍のための高圧ガス/ }).click();
    check((await page.locator('#breadcrumb').innerText()).includes('一般則'), '冷凍用ガスの貯蔵パンくずは一般則');
    await page.locator('.answer-summary summary').click();
    check((await page.locator('.answer-summary').innerText()).includes('一般則'), '冷凍用ガスの貯蔵の回答まとめも一般則');
    const unresolvedQuestion = await page.locator('#stage h2').innerText();
    await page.getByText('答えが分からないとき', { exact: true }).click();
    await page.getByRole('button', { name: '未確認の条件として残す', exact: true }).click();
    const unresolved = await page.locator('.verdict-banner').innerText();
    const unresolvedNote = await page.locator('#stage > div > .note-box').innerText();
    await page.reload(); await page.getByRole('button', { name: '続きから再開', exact: true }).click();
    check(await page.locator('.verdict-banner.needs_confirmation').count() === 1, '未確認の判定種別を保存復元');
    check(await page.locator('.verdict-banner').innerText() === unresolved, '未確認の見出し・設問文を保存復元');
    check(await page.locator('#stage > div > .note-box').innerText() === unresolvedNote, '未確認の注記を保存復元');
    await page.getByRole('button', { name: '一つ前に戻る', exact: true }).click();
    check(await page.locator('#stage h2').innerText() === unresolvedQuestion, '未確認結果から同じ設問へ戻る');
    await page.locator('.mode-tab[data-mode="home"]').click();
    await page.getByRole('button', { name: /^新しく始める/ }).click();
    await page.getByRole('button', { name: /^製造 / }).click();
    await page.getByRole('button', { name: /^冷凍のための製造/ }).click();
    check((await page.locator('#breadcrumb').innerText()).includes('冷凍則'), '冷凍製造のパンくずは冷凍則を維持');
    // fact未定義の補足資料にも、独立した条件と進捗・保存復元がある。
    await page.locator('.mode-tab[data-mode="catalogue"]').click();
    await page.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
    await page.locator('.procedure-row').filter({ hasText: '高圧ガス製造許可申請' }).click();
    const condition = page.locator('#fact-manufacture-permit-additional');
    const progressUnknown = await page.locator('.check-progress').innerText();
    await condition.selectOption('yes');
    const progressYes = await page.locator('.check-progress').innerText();
    await page.locator('[data-document-id="additional"]').check();
    await condition.selectOption('no');
    const progressNo = await page.locator('.check-progress').innerText();
    check(progressUnknown !== progressYes && progressYes !== progressNo, 'factなしの資料も条件に応じて未確認数・進捗が変わる');
    check(await page.locator('[data-document-id="additional"]').isDisabled(), '非該当の資料を準備数から除外');
    check(!await page.locator('[data-document-id="additional"]').isChecked(), '条件を変えた資料の古いチェックを解除');
    await page.reload(); await page.getByRole('button', { name: '続きから再開', exact: true }).click();
    check(await condition.inputValue() === 'no', 'factなしの資料の選択を保存復元');
    check(await page.locator('.check-progress').innerText() === progressNo, '復元後も同じ書類準備数');
    await condition.selectOption('unknown');
    check((await page.locator('.document-row').filter({ has: page.locator('[data-document-id="additional"]') }).innerText()).includes('条件未確認'), '未確認へ戻せる');
    await page.locator('.mode-tab[data-mode="home"]').click();

    // 現行データとは別の架空の法令を利用し、更新失敗時のキャッシュ保全を検証。
    await context.unroute('https://laws.e-gov.go.jp/**');
    await context.route('https://laws.e-gov.go.jp/**', route => route.fulfill({ json: fixture }));
    await page.locator('.mode-tab[data-mode="browse"]').click(); await page.getByRole('button', { name: '一般則 一般高圧ガス保安規則', exact: true }).click();
    await page.getByRole('heading', { name: /検証用法令/ }).waitFor();
    await context.unroute('https://laws.e-gov.go.jp/**'); await context.route('https://laws.e-gov.go.jp/**', route => route.abort());
    await page.getByRole('button', { name: /最新版を再取得/ }).click();
    await page.getByText('最新版を取得できませんでした。取得日を確認のうえ、保存済み条文を参照してください。', { exact: true }).waitFor();
    check(await page.getByRole('button', { name: '第一章 検証', exact: true }).isVisible(), '更新失敗でも保存済み条文を維持');
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const req = indexedDB.open('kouatsu-gas-law-db', 2); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['draft', 'history'], 'readwrite');
        tx.objectStore('draft').put({ version: 'old-version', savedAt: new Date().toISOString(), mode: 'diagnosis', nav: { purpose: 'new' }, diag: { actionType: 'sales', gasCategory: 'general', answers: { selfSale: 'yes' }, finished: true } }, 'current');
        tx.objectStore('history').add({ type: 'diagnosis', actionType: 'sales', actionLabel: '販売', gasCategory: 'general', answers: { selfSale: 'yes' }, verdict: 'none', title: '古い判定の検証', timestamp: new Date().toISOString() });
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      }); db.close();
    });
    await page.reload(); await page.getByRole('button', { name: '続きから再開', exact: true }).click();
    check(await page.getByRole('heading', { name: '新しく始める事業・取扱いを選んでください' }).isVisible(), '旧版の下書きは再回答を求める');
    check(await page.locator('.procedure-guide').count() === 0, '旧判定を現在の結果として表示しない');
    await page.locator('.history-panel summary').click();
    await page.locator('.history-open').filter({ hasText: '古い判定の検証' }).click();
    check(await page.getByRole('heading', { name: '新しく始める事業・取扱いを選んでください' }).isVisible(), '旧版の履歴も再回答を求める');
    check(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return new Set(ids).size === ids.length; }), 'HTMLのIDが重複しない');
    check(errors.length === 0, `ブラウザー例外なし: ${errors.join('; ')}`);
    console.log(`PASS ${url.startsWith('file:') ? 'standalone/file' : url.includes('/src/') ? 'source/modules' : 'published/http'}`);
    await context.close();
  }

  // 実IndexedDBで保存時の上限を確認（独立した一時プロファイル）。
  const storageContext = await browser.newContext();
  await storageContext.route('https://**/*', route => route.abort());
  const storagePage = await storageContext.newPage();
  await storagePage.goto(origin + '/src/kouatsu/index.html');
  await storagePage.getByRole('heading', { name: /必要な手続きから/ }).waitFor();
  const limits = await storagePage.evaluate(async storageUrl => {
    const s = await import(storageUrl);
    await s.putCachedLaw('retained-law', { fixture: true }, 'test');
    for (let n = 0; n < 201; n++) await s.addHistoryEntry({ sequence: n });
    const entries = await s.listHistory(1000);
    const preparations = {};
    for (let n = 0; n < 51; n++) for (const proc of ['one','two']) preparations[n+':'+proc+':{}'] = { lastUsedAt:n, facts:{}, checks:{ form:true, plan:true } };
    await s.writeDraft({ nav:{ preparations }, version:'test' });
    const saved = await s.readDraft();
    const law = await s.getCachedLaw('retained-law');
    const db = await new Promise(resolve => { const req=indexedDB.open('kouatsu-gas-law-db');req.onsuccess=()=>resolve(req.result); });
    const rawCount = await new Promise(resolve=>{const r=db.transaction('history').objectStore('history').count();r.onsuccess=()=>resolve(r.result);});
    const shape = { version:db.version, stores:[...db.objectStoreNames] }; db.close();
    return { rawCount, sequences:entries.map(e=>e.sequence), preparations:saved.nav.preparations, cached:law.data.fixture, shape };
  }, origin + '/src/kouatsu/js/storage.js');
  check(limits.rawCount === 200 && limits.sequences.length === 200, '201件追加後の履歴ストアは200件');
  check(!limits.sequences.includes(0) && limits.sequences[0] === 200, '最古の履歴だけを削除し新しい順を保持');
  check(Object.keys(limits.preparations).length === 100 && !limits.preparations['0:one:{}'], '保存済み準備リストも50案件・複数手続きを保持');
  check(limits.cached && limits.shape.version === 2 && limits.shape.stores.join(',') === 'draft,history,lawCache', '法令キャッシュとDBv2のストア構成を保全');
  await storageContext.close();

  const blockedContext = await browser.newContext();
  await blockedContext.route('https://**/*', route => route.abort());
  await blockedContext.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new Error('検証用: 保存禁止'); } }));
  const blockedPage = await blockedContext.newPage(); await blockedPage.goto(published);
  await blockedPage.getByRole('heading', { name: /必要な手続きから/ }).waitFor();
  check(await blockedPage.locator('#storage-status').isVisible(), '保存できない場合の継続案内');
  await blockedPage.locator('.mode-tab[data-mode="catalogue"]').click(); await blockedPage.locator('.procedure-row').first().click();
  check(await blockedPage.locator('.download-link').count() > 0, '保存禁止でも手続き資料を利用できる');
  await blockedContext.close();
  console.log(`PASS ${assertions} browser assertions`);
} finally {
  await browser.close(); await new Promise(r => server.close(r));
}
