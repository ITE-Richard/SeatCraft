const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_LAYOUT, buildClassroom, isAdjacent } = require('../src/classroom.js');

const labels = (c, idx) => idx.map((i) => c.seats[i].label);
const indexOf = (c, label) => c.seats.find((s) => s.label === label).index;

test('預設教室有 43 個座位', () => {
  assert.equal(buildClassroom(DEFAULT_LAYOUT).seats.length, 43);
});

test('區域符合 Richard 確認的定義', () => {
  const c = buildClassroom(DEFAULT_LAYOUT);
  assert.deepEqual(labels(c, c.zones.front), ['01', '02', '03', '04', '05', '06', '07']);
  assert.deepEqual(labels(c, c.zones.back), ['42', '43']);
  assert.deepEqual(labels(c, c.zones.left), ['01', '08', '15', '22', '29']);
  assert.deepEqual(labels(c, c.zones.right), ['07', '14', '21', '28', '35', '41', '43']);
});

test('停用座位不會讓區域移動', () => {
  const c = buildClassroom(DEFAULT_LAYOUT, ['42', '43']);
  assert.equal(c.seats.length, 41);
  assert.deepEqual(c.zones.back, []);
  assert.deepEqual(labels(c, c.zones.right), ['07', '14', '21', '28', '35', '41']);
});

test('相鄰為 8 格，含斜對角', () => {
  const c = buildClassroom(DEFAULT_LAYOUT);
  assert.deepEqual(labels(c, c.adjacency[indexOf(c, '09')]), ['01', '02', '03', '08', '10', '15', '16', '17']);
  assert.deepEqual(labels(c, c.adjacency[indexOf(c, '42')]), ['38', '39', '40']);
  assert.deepEqual(labels(c, c.adjacency[indexOf(c, '43')]), ['40', '41']);
  assert.ok(isAdjacent(c, indexOf(c, '01'), indexOf(c, '09')));
  assert.ok(!isAdjacent(c, indexOf(c, '42'), indexOf(c, '43')));
  assert.ok(!isAdjacent(c, indexOf(c, '01'), indexOf(c, '01')));
});

const { DEFAULT_GRID, makeLayout } = require('../src/classroom.js');

test('預設的列數／排數／X 格子產生的教室與 教室內座位.md 相同', () => {
  assert.deepEqual(makeLayout(DEFAULT_GRID), DEFAULT_LAYOUT);
});

test('自訂教室：座位依序編號、X 格子不編號，區域取有座位的最外圈', () => {
  const layout = makeLayout({ rows: 3, cols: 4, blocked: ['0,0', '2,1', '2,2', '2,3'] });
  assert.deepEqual(layout.cells, [
    [null, '01', '02', '03'],
    ['04', '05', '06', '07'],
    ['08', null, null, null],
  ]);
  const c = buildClassroom(layout);
  assert.deepEqual(labels(c, c.zones.front), ['01', '02', '03']);
  assert.deepEqual(labels(c, c.zones.back), ['08']);
  assert.deepEqual(labels(c, c.zones.left), ['04', '08']);
  assert.deepEqual(labels(c, c.zones.right), ['03', '07']);
});

test('座位超過 99 個時編號補成三位數', () => {
  const layout = makeLayout({ rows: 10, cols: 10, blocked: [] });
  assert.equal(layout.cells[0][0], '001');
  assert.equal(layout.cells[9][9], '100');
});
