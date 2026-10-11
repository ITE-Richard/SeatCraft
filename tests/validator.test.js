const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_LAYOUT, buildClassroom } = require('../src/classroom.js');
const validator = require('../src/validator.js');
const { CODES, maxIndependentSetSize, staticCheck, checkAssignment } = validator;

test('CODES 匯出所有定義之錯誤代碼', () => {
  assert.ok(CODES.NO_STUDENTS);
  assert.ok(CODES.INVALID_STUDENT_ID);
  assert.ok(CODES.DUPLICATE_STUDENT_ID);
  assert.ok(CODES.INVALID_GROUP_SIZE);
  assert.ok(CODES.GROUP_STUDENT_NOT_FOUND);
  assert.ok(CODES.INVALID_ZONE_NAME);
  assert.ok(CODES.ZONE_STUDENT_NOT_FOUND);
  assert.ok(CODES.TOO_MANY_STUDENTS);
  assert.ok(CODES.ZONE_EMPTY);
  assert.ok(CODES.ZONE_OVER_CAPACITY);
  assert.ok(CODES.GROUP_OVER_CAPACITY);
  assert.ok(CODES.GROUP_ZONE_OVER_CAPACITY);
  assert.ok(CODES.STUDENT_UNASSIGNED);
  assert.ok(CODES.INVALID_SEAT);
  assert.ok(CODES.DUPLICATE_SEAT);
  assert.ok(CODES.ZONE_VIOLATION);
  assert.ok(CODES.ADJACENT_IN_GROUP);
});

test('最大獨立集演算法：預設教室 43 席之最大不相鄰座位數精確值為 14', () => {
  // 數學證明：
  // 教室共 7 列。在任兩相鄰列中，將 7 排分為 4 個 2x2（或 2x1）區塊：{0,1}, {2,3}, {4,5}, {6}。
  // 每一區塊內所有座位兩兩相鄰，故任何相鄰兩列最多只能選 4 個座位。
  // 將教室列劃分為 (列0+列1) <= 4, (列2+列3) <= 4, (列4+列5) <= 4, 列6 <= 2。
  // 總計不超過 4 + 4 + 4 + 2 = 14。
  // 而選取 (0,0), (0,2), (0,4), (0,6), (2,0), (2,2), (2,4), (2,6), (4,0), (4,2), (4,4), (4,6), (6,4), (6,6)
  // 共 14 個座位且兩兩不相鄰，故最大獨立集嚴格等於 14。
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const allSeatIndices = cr.seats.map((s) => s.index);
  const maxSeats = maxIndependentSetSize(cr, allSeatIndices);
  assert.equal(maxSeats, 14);
});

test('最大獨立集演算法：各區域獨立集大小計算', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  // front (7 席)：最前列 7 個座位，最大獨立集為 4
  assert.equal(maxIndependentSetSize(cr, cr.zones.front), 4);
  // back (2 席)：座位 42 (col 4) 與 43 (col 6) 不相鄰，最大獨立集為 2
  assert.equal(maxIndependentSetSize(cr, cr.zones.back), 2);
  // left (5 席)：最左排 5 個座位，最大獨立集為 3
  assert.equal(maxIndependentSetSize(cr, cr.zones.left), 3);
  // right (7 席)：最右排 7 個座位，最大獨立集為 4
  assert.equal(maxIndependentSetSize(cr, cr.zones.right), 4);
});

test('staticCheck: 正確合法的問題回傳空陣列', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: '小明' },
      { id: 2, name: '小華' },
      { id: 3, name: '小美' },
    ],
    zones: { 1: 'front', 2: 'back' },
    groups: [[1, 2]],
  };
  const issues = staticCheck(problem);
  assert.deepEqual(issues, []);
});

test('staticCheck (input): NO_STUDENTS 學生名單為空或非陣列', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const issues1 = staticCheck({ classroom: cr, students: [] });
  assert.equal(issues1.length, 1);
  assert.equal(issues1[0].code, CODES.NO_STUDENTS);
  assert.equal(issues1[0].kind, 'input');

  const issues2 = staticCheck({ classroom: cr, students: null });
  assert.equal(issues2.length, 1);
  assert.equal(issues2[0].code, CODES.NO_STUDENTS);
});

test('staticCheck (input): INVALID_STUDENT_ID 學生 id 非大於 0 之整數', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: 'A' },
      { id: -2, name: 'B' },
      { id: '3', name: 'C' },
    ],
  };
  const issues = staticCheck(problem);
  const invalidIdIssues = issues.filter((i) => i.code === CODES.INVALID_STUDENT_ID);
  assert.equal(invalidIdIssues.length, 2);
});

test('staticCheck (input): DUPLICATE_STUDENT_ID 學生 id 重複', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: 'A' },
      { id: 1, name: 'B' },
    ],
  };
  const issues = staticCheck(problem);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, CODES.DUPLICATE_STUDENT_ID);
  assert.deepEqual(issues[0].students, [1]);
});

test('staticCheck (input): INVALID_GROUP_SIZE 群組少於 2 人', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ],
    groups: [[1], [2, 2]],
  };
  const issues = staticCheck(problem);
  const groupSizeIssues = issues.filter((i) => i.code === CODES.INVALID_GROUP_SIZE);
  assert.equal(groupSizeIssues.length, 2);
});

test('staticCheck (input): GROUP_STUDENT_NOT_FOUND 群組引用不存在的學生', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [{ id: 1, name: 'A' }],
    groups: [[1, 99]],
  };
  const issues = staticCheck(problem);
  const notFound = issues.find((i) => i.code === CODES.GROUP_STUDENT_NOT_FOUND);
  assert.ok(notFound);
  assert.deepEqual(notFound.students, [99]);
});

test('staticCheck (input): INVALID_ZONE_NAME 區域值不合法', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [{ id: 1, name: 'A' }],
    zones: { 1: 'middle' },
  };
  const issues = staticCheck(problem);
  const invalidZone = issues.find((i) => i.code === CODES.INVALID_ZONE_NAME);
  assert.ok(invalidZone);
  assert.deepEqual(invalidZone.students, [1]);
});

test('staticCheck (input): ZONE_STUDENT_NOT_FOUND 區域指派給不存在的學生', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [{ id: 1, name: 'A' }],
    zones: { 99: 'front' },
  };
  const issues = staticCheck(problem);
  const zoneNotFound = issues.find((i) => i.code === CODES.ZONE_STUDENT_NOT_FOUND);
  assert.ok(zoneNotFound);
  assert.deepEqual(zoneNotFound.students, [99]);
});

test('staticCheck (infeasible): TOO_MANY_STUDENTS 學生數大於座位數', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  // 預設 43 個座位，輸入 44 位學生
  const students = Array.from({ length: 44 }, (_, i) => ({ id: i + 1, name: `學生${i + 1}` }));
  const problem = {
    classroom: cr,
    students,
  };
  const issues = staticCheck(problem);
  const tooMany = issues.find((i) => i.code === CODES.TOO_MANY_STUDENTS);
  assert.ok(tooMany);
  assert.equal(tooMany.kind, 'infeasible');
  assert.equal(tooMany.students.length, 44);
});

test('staticCheck (infeasible): ZONE_EMPTY 區域座位數為 0 但有人指定', () => {
  // 將 back 的座位 42, 43 停用
  const cr = buildClassroom(DEFAULT_LAYOUT, ['42', '43']);
  assert.equal(cr.zones.back.length, 0);
  const problem = {
    classroom: cr,
    students: [{ id: 1, name: 'A' }],
    zones: { 1: 'back' },
  };
  const issues = staticCheck(problem);
  const zoneEmpty = issues.find((i) => i.code === CODES.ZONE_EMPTY);
  assert.ok(zoneEmpty);
  assert.equal(zoneEmpty.kind, 'infeasible');
  assert.match(zoneEmpty.message, /沒有可用座位/);
});

test('staticCheck (infeasible): ZONE_OVER_CAPACITY 指定某區人數大於該區座位數', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  // back 只有 2 個座位，指定 3 人
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ],
    zones: { 1: 'back', 2: 'back', 3: 'back' },
  };
  const issues = staticCheck(problem);
  const overCap = issues.find((i) => i.code === CODES.ZONE_OVER_CAPACITY);
  assert.ok(overCap);
  assert.equal(overCap.kind, 'infeasible');
  assert.equal(overCap.message, '指定坐「最後一列」的有 3 人，但最後一列只有 2 個座位。');
});

test('staticCheck (infeasible): GROUP_OVER_CAPACITY 與 GROUP_ZONE_OVER_CAPACITY (5人同組且全限 left)', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  // left 只有 5 席（01, 08, 15, 22, 29），最大不相鄰只有 3 席
  // 5 人在同一個群組，且全部限制 left
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
      { id: 4, name: 'D' },
      { id: 5, name: 'E' },
    ],
    zones: { 1: 'left', 2: 'left', 3: 'left', 4: 'left', 5: 'left' },
    groups: [[1, 2, 3, 4, 5]],
  };
  const issues = staticCheck(problem);
  const groupOver = issues.find((i) => i.code === CODES.GROUP_OVER_CAPACITY);
  const groupZoneOver = issues.find((i) => i.code === CODES.GROUP_ZONE_OVER_CAPACITY);
  assert.ok(groupOver, '應回報 GROUP_OVER_CAPACITY');
  assert.ok(groupZoneOver, '應回報 GROUP_ZONE_OVER_CAPACITY');
  assert.match(groupZoneOver.message, /最多只能容納 3 個不相鄰座位/);
});

test('staticCheck (infeasible): 群組無區域限制時，人數超過全教室最大不相鄰座位數 (15人)', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  // 預設教室全教室最大不相鄰座位數為 14，若一組有 15 人，則不可能不相鄰
  const students = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `S${i + 1}` }));
  const group = students.map((s) => s.id);
  const problem = {
    classroom: cr,
    students,
    groups: [group],
  };
  const issues = staticCheck(problem);
  const groupOver = issues.find((i) => i.code === CODES.GROUP_OVER_CAPACITY);
  assert.ok(groupOver);
  assert.match(groupOver.message, /最多只能容納 14 個不相鄰座位/);
});

test('checkAssignment: 合法排座回傳空陣列', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ],
    zones: { 1: 'front', 2: 'back' },
    groups: [[1, 2]],
  };
  // 座位 0 (Seat 01 - front) 與 座位 41 (Seat 42 - back)
  const assignment = { 1: 0, 2: 41 };
  const issues = checkAssignment(problem, assignment);
  assert.deepEqual(issues, []);
});

test('checkAssignment (violation): STUDENT_UNASSIGNED 學生未入座', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: '王小明' },
      { id: 2, name: '陳小美' },
    ],
  };
  const assignment = { 1: 0 }; // 學生 2 沒入座
  const issues = checkAssignment(problem, assignment);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, CODES.STUDENT_UNASSIGNED);
  assert.deepEqual(issues[0].students, [2]);
  assert.match(issues[0].message, /陳小美.*尚未安排座位/);
});

test('checkAssignment (violation): INVALID_SEAT 座位不存在或停用', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [{ id: 1, name: 'A' }],
  };
  const assignment = { 1: 999 };
  const issues = checkAssignment(problem, assignment);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, CODES.INVALID_SEAT);
  assert.deepEqual(issues[0].seats, [999]);
});

test('checkAssignment (violation): DUPLICATE_SEAT 兩人同座', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ],
  };
  const assignment = { 1: 0, 2: 0 };
  const issues = checkAssignment(problem, assignment);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, CODES.DUPLICATE_SEAT);
  assert.deepEqual(issues[0].students, [1, 2]);
  assert.deepEqual(issues[0].seats, [0]);
  assert.match(issues[0].message, /Seat 01/);
});

test('checkAssignment (violation): ZONE_VIOLATION 區域違規', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  const problem = {
    classroom: cr,
    students: [{ id: 1, name: 'A' }],
    zones: { 1: 'front' },
  };
  // 座位 41 是 Seat 42 (back)，非 front
  const assignment = { 1: 41 };
  const issues = checkAssignment(problem, assignment);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, CODES.ZONE_VIOLATION);
  assert.deepEqual(issues[0].students, [1]);
  assert.deepEqual(issues[0].seats, [41]);
  assert.match(issues[0].message, /第一列.*Seat 42/);
});

test('checkAssignment (violation): ADJACENT_IN_GROUP 群組內相鄰，且每對只回報一次', () => {
  const cr = buildClassroom(DEFAULT_LAYOUT);
  // 座位 09 (Seat 09) 與 10 (Seat 10)
  const idx09 = cr.seats.find((s) => s.label === '09').index;
  const idx10 = cr.seats.find((s) => s.label === '10').index;

  const problem = {
    classroom: cr,
    students: [
      { id: 3, name: '張三' },
      { id: 7, name: '李四' },
    ],
    // 故意在兩個群組中都放入 3 和 7，驗證只回報一次
    groups: [
      [3, 7],
      [3, 7],
    ],
  };
  const assignment = { 3: idx09, 7: idx10 };
  const issues = checkAssignment(problem, assignment);

  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, CODES.ADJACENT_IN_GROUP);
  assert.deepEqual(issues[0].students, [3, 7]);
  assert.deepEqual(issues[0].seats, [idx09, idx10].sort((a, b) => a - b));
  assert.equal(issues[0].message, '第 3、7 號學生在同一組，但座位 Seat 09 和 Seat 10 相鄰。');
});

test('UMD 外殼支援瀏覽器掛載全域 SeatCraft.validator', () => {
  // 模擬純瀏覽器環境
  const fakeRoot = {
    SeatCraft: {
      classroom: require('../src/classroom.js'),
    },
  };
  const fs = require('fs');
  const code = fs.readFileSync(require.resolve('../src/validator.js'), 'utf8');
  const vm = require('vm');
  const context = {
    self: fakeRoot,
    SeatCraft: fakeRoot.SeatCraft,
  };
  vm.createContext(context);
  vm.runInContext(code, context);

  assert.ok(context.SeatCraft.validator);
  assert.ok(context.SeatCraft.validator.staticCheck);
  assert.ok(context.SeatCraft.validator.checkAssignment);
  assert.ok(context.SeatCraft.validator.maxIndependentSetSize);
});
