// Pagesのサブパス・既存SWからの更新・保存データ保全を一時プロファイルで確認する。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NAV_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = '/My-tools-portal/';
let oldVersion = true;
// 本番v13と同じキャッシュ名・install/activate動作で旧端末の状態を再現。
const oldWorker = `const CACHE_NAME='law-tools-portal-v13';
self.addEventListener('install', e => {e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(['./','./tools/kouatsu-gas-law-viewer.html'])));self.skipWaiting();});
self.addEventListener('activate', e => {e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch', e => {if(e.request.method==='GET'&&new URL(e.request.url).origin===self.location.origin)e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});`;
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/another-tool/resource.txt') {res.end('another-tool-network'); return;}
    if (!pathname.startsWith(prefix)) {res.writeHead(404);res.end();return;}
    const relative = pathname.slice(prefix.length) || 'index.html';
    if (relative.endsWith('legacy-fixture.bin')) {res.destroy();return;}
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
    const body = oldVersion && relative==='sw.js' ? oldWorker
      : oldVersion && relative==='tools/kouatsu-gas-law-viewer.html' ? '<!doctype html><html lang="ja"><title>旧公開版</title><p>旧公開版</p></html>'
      : await fs.readFile(target);
    res.writeHead(200, {'Content-Type': ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.png':'image/png'})[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(body);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const portal = origin + prefix;
const toolUrl = portal + 'tools/kouatsu-gas-law-viewer.html';
const browser = await chromium.launch(process.env.NAV_BROWSER_PATH ? {executablePath:process.env.NAV_BROWSER_PATH,headless:true} : {headless:true});
let checks = 0;
const check = (value,label) => {assert.ok(value,label);checks++;};
try {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(portal);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const oldHistory = JSON.stringify([{title:'旧端末の照会',version:'2',route:'procedure',answers:{capacity:30}}]);
  await page.evaluate(async ({portal,oldHistory})=>{
    localStorage.setItem('kouatsu-navigator-history',oldHistory);
    const other = await caches.open('another-project-cache');
    await other.put(new URL('/another-tool/resource.txt',portal),new Response('preserve-other-project'));
    const legacy = await caches.open('law-tools-portal-v13');
    await legacy.put(new URL('tools/gaiji-maker-assets/legacy-fixture.bin',portal),new Response('preserve-gaiji-runtime'));
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('kouatsu-navigator-laws',1);r.onupgradeneeded=()=>r.result.createObjectStore('laws');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('laws','readwrite');tx.objectStore('laws').put('preserve-old-law','fixture');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); db.close();
  },{portal,oldHistory});
  oldVersion=false;
  await page.evaluate(async()=>{
    const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    const registration=await navigator.serviceWorker.getRegistration();await registration.update();await changed;
  });
  check(await page.evaluate(async()=> (await caches.keys()).some(k=>k.endsWith(':shell-v14'))),'旧SWから新世代へ更新');
  await page.reload();
  const card=page.locator('a.pick-card[href="./tools/kouatsu-gas-law-viewer.html"]');
  check((await card.innerText()).includes('高圧ガス手続きナビ（奈良県向け）'),'ポータルの新版カード');
  await card.click();
  await page.getByRole('heading',{name:/必要な手続きから/}).waitFor();
  check(page.url()===toolUrl,'既存の公開URLを維持');
  check(await page.locator('#legacy-history-notice').isVisible(),'旧履歴への再回答案内');
  check(await page.evaluate(()=>localStorage.getItem('kouatsu-navigator-history'))===oldHistory,'旧履歴は変換・削除しない');
  check(await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('kouatsu-navigator-laws',1);r.onsuccess=()=>resolve(r.result);});const value=await new Promise(resolve=>{const r=db.transaction('laws').objectStore('laws').get('fixture');r.onsuccess=()=>resolve(r.result);});db.close();return value;})==='preserve-old-law','旧版の条文DBを保全');
  check(await page.evaluate(async()=>{const c=await caches.open('another-project-cache');return (await c.match('/another-tool/resource.txt')).text();})==='preserve-other-project','別プロジェクトのcacheを保全');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'スマホで横スクロール不要');
  check(await page.evaluate(async url=>(await fetch(url)).text(),portal+'tools/gaiji-maker-assets/legacy-fixture.bin')==='preserve-gaiji-runtime','旧外字runtimeを新SWから利用可能');
  await page.evaluate(()=>fetch('/another-tool/resource.txt').then(r=>r.text()));
  check(await page.evaluate(async()=>{const names=(await caches.keys()).filter(k=>k.startsWith('my-tools-portal:'));for(const name of names){if(await (await caches.open(name)).match('/another-tool/resource.txt'))return false;}return true;}),'scope外の応答をキャッシュしない');
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading',{name:/必要な手続きから/}).waitFor();
  check(await page.locator('#legacy-history-notice').isVisible(),'オフライン再訪も新版を表示');
  await page.locator('.mode-tab[data-mode="catalogue"]').click();
  await page.locator('.procedure-row').first().click();
  check(await page.locator('.download-link').count()>0,'オフラインでも準備資料の案内を閲覧');
  check(await page.evaluate(async url=>(await fetch(url)).text(),portal+'tools/gaiji-maker-assets/legacy-fixture.bin')==='preserve-gaiji-runtime','オフラインでも外字の既存cacheを保持');
  await page.goto(portal);
  check(await page.locator('a[href="./tools/lp-law-viewer.html"]').count()===1,'LP法の導線を維持');
  check(await page.locator('a[href="./tools/gaiji-maker.html"]').count()===1,'外字の導線を維持');
  check(await page.locator('a[href="./tools/papermirror-jp/"]').count()===1,'PDFツールの導線を維持');
  await page.locator('a[href="./tools/lp-law-viewer.html"]').click();
  check((await page.title()).includes('液化石油ガス') || (await page.title()).includes('LP'),'LP法のオフラインシェルを維持');
  check(errors.length===0,`ページ例外なし: ${errors.join('; ')}`);
  await context.close();
  console.log(`PASS ${checks} Pages / Service Worker assertions`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
