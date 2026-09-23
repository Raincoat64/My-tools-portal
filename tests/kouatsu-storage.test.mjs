import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { trimPreparations } from '../src/kouatsu/js/storage.js';
const source = await readFile(new URL('../src/kouatsu/js/storage.js', import.meta.url), 'utf8');
test('IndexedDB openの失敗後、同一セッションの保存操作で再試行する', async () => {
  for (const failure of ['error', 'blocked', 'throw']) {
    let attempts = 0, stored = false, lateClosed = false, failedRequest;
    const db = { objectStoreNames: ['lawCache', 'history', 'draft'], transaction() {
      const transaction = {};
      return { objectStore: () => ({ transaction, put() { stored = true; queueMicrotask(() => transaction.oncomplete()); } }) };
    }};
    const sandbox = vm.createContext({ indexedDB: { open(name, version) {
      assert.equal(name, 'kouatsu-gas-law-db'); assert.equal(version, 2);
      attempts++;
      if (attempts === 1 && failure === 'throw') throw new Error('open禁止');
      const request = { result: db, error: new Error('open失敗') };
      if (attempts === 1) { failedRequest = request; queueMicrotask(() => failure === 'error' ? request.onerror() : request.onblocked()); }
      else queueMicrotask(() => request.onsuccess());
      return request;
    }}});
    vm.runInContext(source.replaceAll('export ', '') + '\nglobalThis.storageTest = { readDraft, writeDraft };', sandbox);
    await assert.rejects(sandbox.storageTest.readDraft());
    await sandbox.storageTest.writeDraft({ version: 'test' });
    assert.equal(attempts, 2); assert.equal(stored, true);
    if (failure === 'blocked') {
      failedRequest.result = { close() { lateClosed = true; } };
      failedRequest.onsuccess();
      assert.equal(lateClosed, true, '拒否後に成功した古い接続は閉じる');
    }
  }
});
test('書類準備は50案件を保持し、同一案件の複数手続き・書類を切り捨てない', () => {
  const preparations = {};
  for (let n = 0; n < 51; n++) for (const proc of ['permit', 'inspection']) {
    preparations[n + ':' + proc + ':{}'] = { lastUsedAt: n, checks: { form: true, map: true } };
  }
  const trimmed = trimPreparations(preparations);
  assert.equal(Object.keys(trimmed).length, 100);
  assert.equal(new Set(Object.keys(trimmed).map(k => k.split(':')[0])).size, 50);
  assert.ok(!('0:permit:{}' in trimmed)); assert.ok(!('0:inspection:{}' in trimmed));
  assert.equal(Object.keys(preparations).length, 102, '入力を破壊しない');
  preparations['0:permit:{}'].lastUsedAt = 100;
  const touched = trimPreparations(preparations);
  assert.ok('0:inspection:{}' in touched); assert.ok(!('1:permit:{}' in touched));
});
