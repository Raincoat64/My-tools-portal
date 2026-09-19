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
const urls = [published, new URL('../tools/kouatsu-gas-law-viewer.html', import.meta.url).href];
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
    console.log(`PASS ${url.startsWith('file:') ? 'standalone/file' : 'normal/http'}`);
    await context.close();
  }
  const blockedContext = await browser.newContext();
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
