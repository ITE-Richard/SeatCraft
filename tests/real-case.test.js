const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_LAYOUT, buildClassroom } = require('../src/classroom.js');
const { parseRules } = require('../src/rules.js');
const { staticCheck, checkAssignment } = require('../src/validator.js');
const { solve } = require('../src/solver.js');

// Richard 提供的實際條件：43 人坐滿，12 人的愛講話群組（全教室最多只有 14 個互不相鄰座位）
const REAL = `15號, 14號不能一起坐
15號, 37號不能一起坐
15號, 36號不能一起坐
15號, 26號不能一起坐
26號, 37號不能一起坐
11號, 1號不能一起坐
42號, 43號不能一起坐
1, 11, 6, 13, 21, 24, 14, 15, 24, 36, 37, 42, 43這一群是愛講話的同學, 不能坐一起
24坐第一列
20坐第七列`;

test('實際條件：每個 seed 都能在 200ms 內排出合法座位', () => {
  const { groups, zones } = parseRules(REAL);
  const classroom = buildClassroom(DEFAULT_LAYOUT);
  const students = Array.from({ length: 43 }, (_, i) => ({ id: i + 1, name: '' }));
  const problem = { classroom, students, zones, groups };
  assert.deepEqual(staticCheck(problem), []);

  for (let seed = 1; seed <= 100; seed++) {
    const start = Date.now();
    const result = solve(problem, { seed });
    assert.ok(Date.now() - start < 200, `seed ${seed} 太慢`);
    assert.equal(result.status, 'FEASIBLE', `seed ${seed}`);
    assert.deepEqual(checkAssignment(problem, result.assignment), [], `seed ${seed}`);
  }
});

// Richard 在畫面上實際輸入的版本：愛講話群組多了 34 號，共 13 人（全教室最多 14 個互不相鄰座位）
test('實際輸入（13 人群組）：每個 seed 都能排出合法座位', () => {
  const classroom = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom,
    students: Array.from({ length: 43 }, (_, i) => ({ id: i + 1, name: '' })),
    zones: { 20: 'back', 24: 'front' },
    groups: [[14, 15], [15, 37], [15, 36], [15, 26], [26, 37], [1, 11], [42, 43],
      [1, 6, 11, 13, 14, 15, 21, 24, 34, 36, 37, 42, 43]],
  };
  assert.deepEqual(staticCheck(problem), []);
  for (let seed = 1; seed <= 100; seed++) {
    const result = solve(problem, { seed });
    assert.equal(result.status, 'FEASIBLE', `seed ${seed}`);
    assert.deepEqual(checkAssignment(problem, result.assignment), [], `seed ${seed}`);
  }
});
