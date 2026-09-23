// 静的な引用リテラルを全件抽出。分岐を実行しないため到達しない結果も検査する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/kouatsu/js/diagnosis.js', import.meta.url), 'utf8');
const ids = Object.fromEntries([...source.matchAll(/const (\w+) = "(\d[^"]+)";/g)].map(m => [m[1], m[2]]));
const aliases = {
  '高圧ガス保安法施行令': '409CO0000000020', '施行令': '409CO0000000020',
  '液化石油ガス法': '342AC0000000149', '高圧ガス保安法': '326AC0000000204', '法': '326AC0000000204',
  '一般高圧ガス保安規則': '341M50000400053', '一般則': '341M50000400053',
  '液化石油ガス保安規則': '341M50000400052', '液石則': '341M50000400052',
  '冷凍保安規則': '341M50000400051', '冷凍則': '341M50000400051',
  '容器保安規則': '341M50000400050', '容器則': '341M50000400050',
};
function verify(citation) {
  const first = citation.label.match(/第(\d+)条((?:の\d+)*)/);
  assert.ok(first, citation.label);
  const prefix = citation.label.slice(0, first.index);
  const law = prefix.match(new RegExp(Object.keys(aliases).sort((a,b) => b.length-a.length).join('|')));
  assert.ok(law, citation.label);
  assert.equal(citation.lawId, aliases[law[0]], citation.label + ' の法令ID');
  assert.equal(citation.num, first[1] + first[2].replaceAll('の', '_'), citation.label + ' の条番号');
}
test('診断の全引用は法令ID・先頭条番号とラベルが一致する', () => {
  const matches = [...source.matchAll(/\{\s*lawId:\s*(\w+|"[^"]+"),\s*num:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)];
  assert.equal(matches.length, [...source.matchAll(/\blawId\s*:/g)].length, '未抽出の引用を見逃さない');
  assert.ok(matches.length > 150);
  for (const [, id, num, label] of matches) verify({ lawId: id.startsWith('"') ? JSON.parse(id) : ids[id], num, label });
});
test('法令ID違い・枝条違いの検査用引用は確実に失敗する', () => {
  assert.throws(() => verify({ lawId: '326AC0000000204', num: '21', label: '技術基準(一般則第21条〜第23条)' }), /法令ID/);
  assert.throws(() => verify({ lawId: '326AC0000000204', num: '20', label: '法第20条の4' }), /条番号/);
  verify({ lawId: '326AC0000000204', num: '20_4', label: '法第20条の4' });
});
