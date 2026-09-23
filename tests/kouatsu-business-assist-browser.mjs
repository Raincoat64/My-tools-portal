// 一時プロファイルとローカル応答だけで、事業者向け補助の受け渡しを確認する。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { REVISION_BASELINES, KNOWN_PENDING_REVISIONS, KNOWN_REVISION_NOTE } from "../src/kouatsu/js/revisions.js";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NAV_PLAYWRIGHT_PATH || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if (!pathname.startsWith("/My-tools-portal/")) { res.writeHead(404);res.end();return; }
    const target = path.resolve(root, "." + pathname.slice("/My-tools-portal".length));
    if (!target.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
    const content=await fs.readFile(target);
    res.writeHead(200,{"Content-Type":({".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8"})[path.extname(target)] || "application/octet-stream"});res.end(content);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const published = "http://127.0.0.1:" + server.address().port + "/My-tools-portal/tools/kouatsu-gas-law-viewer.html";
const fileUrl = new URL("../tools/kouatsu-gas-law-viewer.html",import.meta.url).href;
const browser = await chromium.launch({headless:true,...(process.env.NAV_BROWSER_PATH ? {executablePath:process.env.NAV_BROWSER_PATH} : {})});
let checks=0;
const requests=[],errors=[];
const check=(value,message)=>{assert.ok(value,message);checks++;};
function fixture(id,mode) {
  const revisions=[{law_revision_id:REVISION_BASELINES[id],current_revision_status:"CurrentEnforced",amendment_enforcement_date:"2026-01-01",amendment_law_title:"確認済みの改正"}];
  revisions.push(...KNOWN_PENDING_REVISIONS.filter(r=>r.startsWith(id)).map(law_revision_id=>({law_revision_id,current_revision_status:"UnEnforced",amendment_enforcement_date:"2026-12-21",amendment_law_title:"令和4年法律第74号"})));
  if (id==="326AC0000000204" && mode==="changed") Object.assign(revisions[0],{law_revision_id:id+"_20270101_fixture",amendment_enforcement_date:"2027-01-01",amendment_law_title:"検証用の施行済み改正"});
  if (id==="326AC0000000204" && mode==="upcoming") revisions.push({law_revision_id:id+"_20280101_fixture",current_revision_status:"UnEnforced",amendment_enforcement_date:"2028-01-01",amendment_law_title:"検証用の未確認改正"});
  return {revisions};
}
async function client(url=published,mode="known",noCompression=false) {
  const context=await browser.newContext({viewport:{width:1100,height:850}});
  if (noCompression) await context.addInitScript(()=>{window.CompressionStream=undefined;window.DecompressionStream=undefined;});
  if (mode==="timeout") await context.addInitScript(()=>{
    const original=window.setTimeout.bind(window);
    window.setTimeout=(fn,ms,...args)=>original(fn,ms===10000 ? 50 : ms,...args);
  });
  const localRequests=[];
  await context.route("https://**/*",async route=>{
    const url=route.request().url();localRequests.push(url);
    if (!url.startsWith("https://laws.e-gov.go.jp/api/2/law_revisions/")) {await route.abort();return;}
    if (mode==="failure") {await route.abort();return;}
    if (mode==="timeout") return;
    const id=url.split("/").at(-1);
    await route.fulfill({json:mode==="invalid" ? {wrong:true} : fixture(id,mode)});
  });
  const page=await context.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>requests.push(r.url()));
  await page.goto(url);
  await page.locator("#stage h2").first().waitFor();
  return {context,page,localRequests};
}
async function coldQuestion(page) {
  await page.locator('.mode-tab[data-mode="home"]').click();
  await page.getByRole("button",{name:/^新しく始める/}).click();
  await page.getByRole("button",{name:/^製造 /}).click();
  await page.getByRole("button",{name:/^冷凍のための製造/}).click();
  await page.getByRole("button",{name:/^不活性ガス等\(第一種ガス\):/}).click();
}
async function salesResult(page) {
  await page.locator('.mode-tab[data-mode="home"]').click();
  for (const name of [/^新しく始める/,/^販売 高圧ガス/,/^一般の高圧ガス/,/^いいえ\(例外/,/^いいえ\(第二種/]) await page.getByRole("button",{name}).click();
  await page.locator('[data-procedure-id="sales-new-general"]').waitFor();
}
async function share(page) {
  if (!await page.locator(".transfer-actions").evaluate(e=>e.open)) await page.locator(".transfer-actions summary").click();
  await page.getByRole("button",{name:"この回答を共有するURLをコピー",exact:true}).click();
  await page.locator(".shared-url").waitFor();
  return page.locator(".shared-url").inputValue();
}
async function draftOf(page) {
  return page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open("kouatsu-gas-law-db",2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const data=await new Promise((resolve,reject)=>{const r=db.transaction("draft").objectStore("draft").get("current");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return data;
  });
}
async function upload(page,data) {
  const buffer=Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
  const input=page.locator('input[data-portable-file="true"]');
  if (!await input.isVisible()) await page.locator(".transfer-actions summary").click();
  await page.evaluate(()=>{ window.transferObserved = new Promise(resolve=>{const observer=new MutationObserver(()=>{observer.disconnect();resolve();});observer.observe(document.getElementById("stage"),{childList:true});}); });
  await input.setInputFiles({name:"kouatsu-navi-test.json",mimeType:"application/json",buffer});
  await page.evaluate(()=>window.transferObserved);
}
try {
  const known=await client();
  await known.page.waitForFunction(()=>document.querySelector(".revision-status")?.textContent.includes("照合日"));
  check(known.localRequests.length===7,"7法令だけを取得");
  check(await known.page.locator(".revision-warning:visible").count()===0,"既知改正は警告しない");
  await known.page.locator(".source-details summary").click();
  check(await known.page.locator(".revision-known-note").innerText()===KNOWN_REVISION_NOTE,"確認済みの注記は出典欄");
  await known.page.reload();
  await known.page.waitForFunction(()=>document.querySelector(".revision-status")?.textContent.includes("照合日"));
  check(known.localRequests.length===7,"24時間内の再表示はAPIを再取得しない");
  await salesResult(known.page);
  const baselineResult=await known.page.locator(".verdict-banner").innerText();
  const schema=await known.page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open("kouatsu-gas-law-db");r.onsuccess=()=>resolve(r.result);});
    const result={version:db.version,stores:[...db.objectStoreNames]};db.close();return result;
  });
  check(schema.version===2 && schema.stores.join(",")==="draft,history,lawCache","DBv2とストアを維持");
  await known.context.close();

  for (const mode of ["changed","upcoming"]) {
    const c=await client(published,mode),page=c.page;
    await page.locator(".revision-warning:visible").waitFor();
    const text=await page.locator(".revision-warning").innerText();
    check(text.includes("高圧ガス保安法") && text.includes(mode==="changed" ? "2027-01-01" : "2028-01-01"),"改正バナーに法令・施行日");
    check(text.includes("2026-09-19") && text.includes("保安係") && await page.locator(".revision-warning a").count()===1,"確認日・連絡目的・公式案内の導線");
    await salesResult(page);
    check(await page.locator(".verdict-banner").innerText()===baselineResult,"改正検知で診断内容を変更しない");
    check(await page.locator(".revision-warning").isVisible(),"診断結果の上部にも注意");
    await page.emulateMedia({media:"print"});await page.evaluate(()=>window.dispatchEvent(new Event("beforeprint")));
    check(await page.locator(".revision-warning").isVisible() && await page.locator(".revision-known-note").isVisible(),"注意と既知注記を印刷に含める");
    await page.evaluate(()=>window.dispatchEvent(new Event("afterprint")));await page.emulateMedia({media:"screen"});
    await page.locator('.mode-tab[data-mode="catalogue"]').click();await page.locator(".procedure-row").first().click();
    check(await page.locator(".revision-warning").isVisible(),"手続き詳細の上部にも注意");
    await c.context.close();
  }
  for (const mode of ["failure","invalid","timeout"]) {
    const c=await client(published,mode),page=c.page;
    await page.waitForFunction(()=>document.querySelector(".revision-status")?.textContent==="改正の有無を確認できませんでした");
    await page.locator(".source-details summary").click();
    check(await page.getByText("改正の有無を確認できませんでした",{exact:true}).isVisible(),mode+"でも出典欄にだけ失敗を表示");
    check(await page.locator(".revision-warning:visible").count()===0,mode+"で未確認の改正と断定しない");
    await page.locator('.mode-tab[data-mode="catalogue"]').click();await page.locator(".procedure-row").first().click();
    check(await page.locator(".download-link").count()>0,mode+"でも申請案内は使える");
    await c.context.close();
  }

  for (const url of [published,fileUrl]) {
    // HTTPは圧縮あり、fileは圧縮APIなしで同じ往復を確認。
    const sender=await client(url,"known",url.startsWith("file:")),page=sender.page;
    await page.getByRole("button",{name:"用語を調べる",exact:true}).click();
    check(await page.locator(".glossary-entry").count()===12,"ホームから用語12項目");
    await page.locator(".glossary-entry summary").first().focus();await page.keyboard.press("Enter");
    check(await page.locator(".glossary-entry").first().evaluate(e=>e.open),"用語はキーボードで開く");
    check(await page.locator(".glossary-entry a").count()>=12,"すべての用語に根拠リンク");
    await coldQuestion(page);
    const question=await page.locator("#stage h2").innerText();
    const midUrl=await share(page);
    if (url.startsWith("file:")) check(midUrl.includes("#kn=1.u."),"圧縮API非対応では非圧縮URL");
    const midReceiver=await client(midUrl);
    check(await midReceiver.page.getByRole("heading",{name:"回答を読み込む前に確認してください"}).isVisible(),"共有途中の確認画面");
    await midReceiver.page.getByRole("button",{name:"開く",exact:true}).click();
    check(await midReceiver.page.locator("#stage h2").innerText()===question,"別コンテキストに同じ設問位置を復元");
    check(!new URL(midReceiver.page.url()).hash,"読み込み後にフラグメントを除去");
    await midReceiver.context.close();

    await page.getByText("答えが分からないとき",{exact:true}).click();
    const related=page.locator(".glossary-entry").filter({has:page.getByText("冷凍能力",{exact:true})});
    await related.locator("summary").click();
    check(await related.evaluate(e=>e.open),"設問の関連用語をホバーなしで開く");
    await page.getByRole("button",{name:"計算補助を開く",exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"スマホ幅の計算補助に横はみ出しなし");
    const value=page.locator('[data-calc-field="value"]');
    for (const bad of ["abc","-1","Infinity"]) {
      await value.fill(bad);await page.getByRole("button",{name:"計算する",exact:true}).click();
      check(await page.locator(".calc-error:visible").count()===1 && await page.locator(".calculation-value").count()===0,"誤入力を欄の直下に表示し結果なし");
      check(await value.getAttribute("aria-invalid")==="true","誤入力を支援技術にも通知");
    }
    await value.fill("20");
    const before=draftOf(page);
    await page.getByRole("button",{name:"計算する",exact:true}).click();
    check((await page.locator(".calculation-choice").innerText()).includes("20 トン/日 以上"),"20t境界は以上の選択肢を案内");
    assert.deepEqual(await draftOf(page),await before);checks++;
    check(await page.locator(".verdict-banner").count()===0,"計算だけでは回答しない");
    await page.getByRole("button",{name:"この選択肢を選ぶ",exact:true}).click();
    await page.locator(".verdict-banner.notification").waitFor();
    const result=await page.locator(".verdict-banner").innerText();
    await page.locator('[data-document-id="form"]').check();
    const resultUrl=await share(page);
    const resultReceiver=await client(resultUrl);
    await resultReceiver.page.getByRole("button",{name:"開く",exact:true}).click();
    check(await resultReceiver.page.locator(".verdict-banner").innerText()===result,"共有結果を別コンテキストで復元");
    check(!await resultReceiver.page.locator('[data-document-id="form"]').isChecked(),"共有URLに書類チェックなし");
    await resultReceiver.context.close();

    const downloadEvent=page.waitForEvent("download");
    await page.getByRole("button",{name:"回答・書類チェックをJSONに書き出す",exact:true}).click();
    const download=await downloadEvent;
    check(/^kouatsu-navi-\d{8}\.json$/.test(download.suggestedFilename()),"JSONファイル名");
    const stream=await download.createReadStream(),chunks=[];for await (const chunk of stream) chunks.push(chunk);
    const envelope=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const receiver=await client(url),target=receiver.page;
    await upload(target,envelope);
    check(await target.locator(".transfer-confirmation").isVisible(),"ファイルも読込前に確認");
    await target.getByRole("button",{name:"開く",exact:true}).click();
    check(await target.locator(".verdict-banner").innerText()===result && await target.locator('[data-document-id="form"]').isChecked(),"JSONで回答と書類チェックを復元");
    const saved=await draftOf(target);
    await target.goto(midUrl);
    await target.getByRole("button",{name:"上書きしないで開く",exact:true}).click();
    check(await target.locator(".display-only-notice").isVisible(),"保存せず表示する旨を明示");
    assert.deepEqual(await draftOf(target),saved);checks++;
    check(await target.locator("#stage h2").innerText()===question && !new URL(target.url()).hash,"保存を保ったまま共有途中を表示・fragment除去");
    await target.reload();await target.getByRole("button",{name:"続きから再開",exact:true}).click();
    check(await target.locator('[data-document-id="form"]').isChecked(),"元の保存済み書類チェックを維持");
    const beforeConfirmation=await draftOf(target);
    await upload(target,envelope);
    check(await target.getByRole("button",{name:"下書きを上書きして開く",exact:true}).isVisible(),"ファイルの上書き前に確認");
    assert.deepEqual(await draftOf(target),beforeConfirmation);checks++;
    await target.getByRole("button",{name:"下書きを上書きして開く",exact:true}).click();
    for (const invalid of [
      {...envelope,format:"other"},{...envelope,schemaVersion:9},{...envelope,procedureVersion:"old"},
      Buffer.alloc(1024*1024+1,32),
    ]) {
      await upload(target,invalid);await target.locator(".transfer-error").first().waitFor();
      check(await target.locator(".transfer-confirmation").count()===0,"不正ファイルは確認・読込へ進まない");
      check(await target.locator('[data-document-id="form"]').isChecked(),"不正ファイルでも現在の状態を保持");
    }
    await receiver.context.close();

    // 処理能力には計算を追加せず、資料上の値を案内。
    await page.locator('.mode-tab[data-mode="home"]').click();
    for (const name of [/^新しく始める/,/^製造 /,/^一般の高圧ガス/,/^不活性ガス等\(第一種ガス\)のみ/]) await page.getByRole("button",{name}).click();
    await page.getByText("答えが分からないとき",{exact:true}).click();
    check(await page.getByRole("button",{name:"計算補助を開く",exact:true}).count()===0 && await page.locator(".processing-record-guide").isVisible(),"処理能力は記載値案内だけ");
    await sender.context.close();
    console.log("PASS business-assist " + (url.startsWith("file:") ? "file/fallback" : "http/compressed"));
  }
  // 目的別・手続き詳細の共有も同じ画面へ戻る。
  const flow=await client(),p=flow.page;
  await p.getByRole("button",{name:/^施設・ガス・会社情報/}).click();
  for (const name of ["製造","一般則","第一種製造者（許可）"]) await p.getByRole("button",{name,exact:true}).click();
  await p.getByText("答えが分からないとき",{exact:true}).click();
  check(await p.locator('.glossary-entry[data-term="manufacturers"]').isVisible(),"目的別の設問にも関連用語を表示");
  const flowUrl=await share(p),flowTarget=await client(flowUrl);
  await flowTarget.page.getByRole("button",{name:"開く",exact:true}).click();
  check(await flowTarget.page.getByRole("heading",{name:"何を変更しますか？",exact:true}).isVisible(),"目的別の途中も共有できる");await flowTarget.context.close();
  await p.locator('.mode-tab[data-mode="catalogue"]').click();await p.locator(".procedure-row").first().click();
  const procedureId=await p.locator(".procedure-guide").getAttribute("data-procedure-id");
  const detailTarget=await client(await share(p));
  await detailTarget.page.getByRole("button",{name:"開く",exact:true}).click();
  check(await detailTarget.page.locator(".procedure-guide").getAttribute("data-procedure-id")===procedureId,"手続き詳細も共有できる");
  await detailTarget.context.close();await flow.context.close();

  for (const hash of ["#kn=broken","#kn=1.d.notcompressed"]) {
    const bad=await client(published+hash);
    check(await bad.page.locator(".transfer-error").isVisible() && await bad.page.locator(".transfer-confirmation").count()===0,"復号できないURLは理由を表示");
    check(await bad.page.getByRole("heading",{name:/必要な手続きから/}).isVisible(),"不正URLから何も読み込まない");
    await bad.context.close();
  }
  check(requests.filter(url=>url.startsWith("https:")).every(url=>/^https:\/\/laws\.e-gov\.go\.jp\/api\/2\/(law_revisions|law_data)\//.test(url)),"外部通信先は既存e-Govと改正APIだけ");
  check(requests.filter(url=>/^https?:/.test(url)).every(url=>!new URL(url).hash),"共有fragmentは送信しない");
  check(errors.length===0,"ブラウザー例外なし："+errors.join("; "));
  console.log("PASS "+checks+" business-assist browser assertions");
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
