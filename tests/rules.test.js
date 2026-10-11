const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRules } = require('../src/rules.js');

// Richard 提供的實際條件
const REAL = `1. 15號, 14號不能一起坐
2. 15號, 37號不能一起坐
3. 15號, 36號不能一起坐
4. 15號, 26號不能一起坐
5. 26號, 37號不能一起坐
6. 11號, 1號不能一起坐
7. 42號, 43號不能一起坐
8. 1, 11, 6, 13, 21, 24, 14, 15, 24, 36, 37, 42, 43這一群是愛講話的同學, 不能坐一起
9. 24坐第一列
10. 20坐第七列`;

test('解析 Richard 的實際條件', () => {
  const r = parseRules(REAL);
  assert.deepEqual(r.lines.filter((l) => l.error), []);
  assert.deepEqual(r.groups, [
    [14, 15], [15, 37], [15, 36], [15, 26], [26, 37], [1, 11], [42, 43],
    [1, 6, 11, 13, 14, 15, 21, 24, 36, 37, 42, 43],
  ]);
  assert.deepEqual(r.zones, { 24: 'front', 20: 'back' });
});

test('各種位置說法', () => {
  const r = parseRules('3號坐最左排\n4 要坐最右邊\n5 第1排\n6 第七排\n7 最後一列\n8 第一列');
  assert.deepEqual(r.zones, { 3: 'left', 4: 'right', 5: 'left', 6: 'right', 7: 'back', 8: 'front' });
});

test('看不懂或不合法的行會回報', () => {
  const r = parseRules('9 坐第三列\n10 號很乖\n11 不能坐一起');
  assert.equal(r.lines.length, 3);
  assert.ok(r.lines.every((l) => l.error));
  assert.deepEqual(r.groups, []);
});

test('身高印象', () => {
  const r = parseRules('3, 7, 12 比較高\n5號 偏矮\n9 很高');
  assert.deepEqual(r.heights, { 3: 'tall', 7: 'tall', 12: 'tall', 5: 'short', 9: 'tall' });
  assert.deepEqual(r.lines.filter((l) => l.error), []);
  assert.deepEqual(parseRules('3 坐最後一列').heights, {});
});
