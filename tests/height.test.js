const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_LAYOUT, buildClassroom, makeLayout } = require('../src/classroom.js');
const { checkAssignment } = require('../src/validator.js');
const { solve } = require('../src/solver.js');
const { score, improve } = require('../src/height.js');

const students = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: '' }));

test('計分：偏高坐前半部、偏高擋偏矮、次要擋視線', () => {
  // 4 列 × 1 排（後半部 = 第 3、4 列）：1 號偏高在最前，2 號普通，3 號偏矮，4 號普通
  const classroom = buildClassroom(makeLayout({ rows: 4, cols: 1, blocked: [] }));
  const problem = { classroom, students: students(4), zones: {}, groups: [], heights: { 1: 'tall', 3: 'short' } };
  const s = score(problem, { 1: 0, 2: 1, 3: 2, 4: 3 });
  assert.equal(s.notBack, 1);
  assert.equal(s.blocks, 1);           // 1 號（偏高）在 3 號（偏矮）前面兩個座位
  assert.deepEqual(s.pairs.map((p) => [p.front, p.back]), [[1, 3]]);
  assert.equal(s.minor, 2);            // 1 擋 2、2 擋 3
  const good = score(problem, { 3: 0, 2: 1, 4: 2, 1: 3 });
  assert.deepEqual([good.notBack, good.blocks, good.minor], [0, 0, 0]);
});

test('後半部：7 列教室為第 4～7 列', () => {
  const { backHalfStart } = require('../src/height.js');
  assert.equal(backHalfStart(buildClassroom(DEFAULT_LAYOUT).seats), 3);
  assert.equal(backHalfStart(buildClassroom(makeLayout({ rows: 6, cols: 2, blocked: [] })).seats), 3);
});

test('沒有衝突時，改善後不再有高的擋到矮的', () => {
  const classroom = buildClassroom(makeLayout({ rows: 4, cols: 3, blocked: [] }));
  const heights = { 1: 'tall', 2: 'tall', 3: 'tall', 10: 'short', 11: 'short', 12: 'short' };
  const problem = { classroom, students: students(12), zones: {}, groups: [], heights };
  // 故意讓偏高的坐第一列、偏矮的坐最後一列
  const start = {};
  for (let id = 1; id <= 12; id++) start[id] = id - 1;
  assert.equal(score(problem, start).notBack, 3);
  const result = improve(problem, start, { seed: 1 });
  const after = score(problem, result);
  assert.deepEqual([after.notBack, after.blocks, after.minor], [0, 0, 0]);
  for (const id of [1, 2, 3]) assert.equal(classroom.seats[result[id]].row, 3);
  for (const id of [10, 11, 12]) assert.equal(classroom.seats[result[id]].row, 0);
});

test('改善身高不會破壞硬條件（Richard 的實際條件）', () => {
  const classroom = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom,
    students: students(43),
    zones: { 20: 'back', 24: 'front' },
    groups: [[14, 15], [15, 37], [15, 36], [15, 26], [26, 37], [1, 11], [42, 43],
      [1, 6, 11, 13, 14, 15, 21, 24, 34, 36, 37, 42, 43]],
    heights: { 5: 'tall', 9: 'tall', 24: 'tall', 30: 'tall', 2: 'short', 15: 'short', 33: 'short' },
  };
  for (let seed = 1; seed <= 20; seed++) {
    const start = solve(problem, { seed });
    assert.equal(start.status, 'FEASIBLE');
    const t = Date.now();
    const result = improve(problem, start.assignment, { seed });
    assert.ok(Date.now() - t < 500, `seed ${seed} 太慢`);
    assert.deepEqual(checkAssignment(problem, result), [], `seed ${seed}`);
    const before = score(problem, start.assignment), after = score(problem, result);
    assert.ok(after.notBack < before.notBack || (after.notBack === before.notBack && after.blocks <= before.blocks));
    // 24 號偏高但被指定坐第一列：硬條件優先，他是唯一沒坐後半部的偏高學生
    assert.deepEqual(after.front.map((f) => f.id), [24], `seed ${seed}`);
    assert.equal(after.blocks, 0, `seed ${seed}：偏高不應擋偏矮`);
  }
});

test('人數少於座位時，改善後空位仍留在後面', () => {
  const classroom = buildClassroom(DEFAULT_LAYOUT);
  const problem = { classroom, students: students(35), zones: {}, groups: [], heights: { 1: 'tall', 2: 'short' } };
  const start = solve(problem, { seed: 3 });
  const result = improve(problem, start.assignment, { seed: 3 });
  const used = new Set(Object.values(result));
  for (const seat of classroom.seats) if (seat.row <= 3) assert.ok(used.has(seat.index), `Seat ${seat.label} 應有人`);
});
