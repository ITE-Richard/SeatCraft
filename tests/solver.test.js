const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DEFAULT_LAYOUT, buildClassroom } = require('../src/classroom.js');
const { solve } = require('../src/solver.js');

function problem(n, overrides = {}) {
  return {
    classroom: buildClassroom(DEFAULT_LAYOUT),
    students: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: '' })),
    zones: {}, groups: [], ...overrides,
  };
}

// Independent geometry-based check, deliberately not using the validator.
function verify(p, result) {
  assert.equal(result.status, 'FEASIBLE');
  const { assignment } = result;
  const used = new Set();
  assert.equal(Object.keys(assignment).length, p.students.length);
  for (const { id } of p.students) {
    const seat = assignment[id];
    assert.ok(Number.isInteger(seat) && seat >= 0 && seat < p.classroom.seats.length);
    assert.ok(!used.has(seat), 'two students share a seat');
    used.add(seat);
    if (p.zones[id]) assert.ok(p.classroom.zones[p.zones[id]].includes(seat));
  }
  for (const group of p.groups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = p.classroom.seats[assignment[group[i]]];
        const b = p.classroom.seats[assignment[group[j]]];
        assert.ok(Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) > 1);
      }
    }
  }
}

function constrained(n = 43) {
  return problem(n, {
    zones: { 1: 'front', 2: 'front', 3: 'front', 4: 'back', 5: 'back',
      6: 'left', 7: 'left', 8: 'left', 9: 'right', 10: 'right', 11: 'right' },
    groups: [[1, 2, 3], [4, 5], [6, 7, 8], [9, 10, 11], [2, 12, 13, 14],
      [7, 14, 15, 16], [17, 18, 19, 20]],
  });
}

test('43 students fill all seats without restrictions', () => {
  const p = problem(43);
  const result = solve(p);
  verify(p, result);
  assert.equal(result.nodes, 43);
});

test('zones and overlapping groups satisfy every hard constraint for 30–43 students', () => {
  for (const n of [30, 35, 43]) {
    for (let seed = 1; seed <= 20; seed++) verify(constrained(n), solve(constrained(n), { seed }));
  }
});

test('seed and node budget reproduce the entire result; different seeds vary it', () => {
  const p = constrained();
  const first = solve(p, { seed: 12, maxNodes: 10000 });
  assert.deepEqual(solve(p, { seed: 12, maxNodes: 10000 }), first);
  assert.notDeepEqual(solve(p, { seed: 13, maxNodes: 10000 }).assignment, first.assignment);
  assert.deepEqual(solve(p), solve(p, { seed: 1, maxNodes: 200000 }));
});

test('three group members restricted to the two back seats are infeasible', () => {
  const result = solve(problem(3, { zones: { 1: 'back', 2: 'back', 3: 'back' }, groups: [[1, 2, 3]] }));
  assert.equal(result.status, 'INFEASIBLE');
  assert.equal(result.assignment, null);
});

test('node budget exhaustion is UNKNOWN, with no partial assignment', () => {
  for (const maxNodes of [0, 1, 10, 42]) {
    const p = problem(43);
    const result = solve(p, { maxNodes });
    assert.deepEqual(result, { status: 'UNKNOWN', assignment: null, nodes: maxNodes });
    assert.deepEqual(solve(p, { maxNodes }), result);
  }
  verify(problem(43), solve(problem(43), { maxNodes: 43 }));
});

test('35 students leave all empty seats behind the fifth row', () => {
  for (let seed = 0; seed < 10; seed++) {
    const p = problem(35);
    const result = solve(p, { seed });
    verify(p, result);
    const used = new Set(Object.values(result.assignment));
    for (const seat of p.classroom.seats) assert.equal(used.has(seat.index), seat.row < 5);
  }
});

test('back-row hard restrictions override the front-row soft preference', () => {
  const p = problem(2, { zones: { 1: 'back', 2: 'back' }, groups: [[1, 2]] });
  verify(p, solve(p));
});

test('disabled seats preserve zone geometry and cannot be assigned', () => {
  const p = problem(30, {
    classroom: buildClassroom(DEFAULT_LAYOUT, ['01', '08', '42']),
    zones: { 1: 'left', 2: 'back' }, groups: [[1, 2, 3]],
  });
  verify(p, solve(p));
  const emptyBack = problem(1, {
    classroom: buildClassroom(DEFAULT_LAYOUT, ['42', '43']), zones: { 1: 'back' },
  });
  assert.deepEqual(solve(emptyBack), { status: 'INFEASIBLE', assignment: null, nodes: 0 });
});

test('more students than seats are provably infeasible without exponential search', () => {
  assert.deepEqual(solve(problem(44)), { status: 'INFEASIBLE', assignment: null, nodes: 0 });
});

test('diagonal neighbors are forbidden, including at the exact exhaustion boundary', () => {
  const room = buildClassroom({ rows: 2, cols: 2, cells: [['A', null], [null, 'B']] });
  const p = problem(2, { classroom: room, groups: [[1, 2]] });
  assert.deepEqual(solve(p, { maxNodes: 1 }), { status: 'UNKNOWN', assignment: null, nodes: 1 });
  assert.deepEqual(solve(p, { maxNodes: 2 }), { status: 'INFEASIBLE', assignment: null, nodes: 2 });
});

test('input remains unchanged, including after failed searches', () => {
  const p = constrained();
  const before = JSON.stringify(p);
  solve(p);
  solve(p, { maxNodes: 2 });
  assert.equal(JSON.stringify(p), before);
});

test('invalid node budgets are rejected instead of yielding false infeasibility', () => {
  for (const maxNodes of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => solve(problem(1), { maxNodes }), RangeError);
  }
});

// Plain exhaustive assignment enumeration serves as an independent oracle.
function bruteFeasible(p) {
  const assigned = [];
  function visit(i) {
    if (i === p.students.length) return true;
    const id = p.students[i].id;
    for (const seat of p.classroom.seats) {
      if (assigned.includes(seat.index)) continue;
      if (p.zones[id] && !p.classroom.zones[p.zones[id]].includes(seat.index)) continue;
      let allowed = true;
      for (let j = 0; j < i; j++) {
        const peer = p.students[j].id;
        if (!p.groups.some((group) => group.includes(id) && group.includes(peer))) continue;
        const other = p.classroom.seats[assigned[j]];
        if (Math.max(Math.abs(seat.row - other.row), Math.abs(seat.col - other.col)) <= 1) allowed = false;
      }
      if (!allowed) continue;
      assigned.push(seat.index);
      if (visit(i + 1)) return true;
      assigned.pop();
    }
    return false;
  }
  return visit(0);
}

test('exhaustive small-grid oracle agrees across zones, group graphs and seeds', () => {
  const room = buildClassroom({ rows: 2, cols: 3, cells: [['A', 'B', 'C'], ['D', 'E', 'F']] });
  const edges = [[1, 2], [1, 3], [2, 3]];
  const zoneCases = [{}, { 1: 'front' }, { 1: 'left', 2: 'right' },
    { 1: 'front', 2: 'front', 3: 'front' }, { 1: 'left', 2: 'left' }];
  let backtracked = false;
  for (let mask = 0; mask < 8; mask++) {
    for (const zones of zoneCases) {
      const p = problem(3, { classroom: room, zones, groups: edges.filter((_, i) => mask & (1 << i)) });
      const expected = bruteFeasible(p) ? 'FEASIBLE' : 'INFEASIBLE';
      for (const seed of [1, 2, 7]) {
        const result = solve(p, { seed });
        assert.equal(result.status, expected, JSON.stringify({ mask, zones, seed }));
        if (expected === 'FEASIBLE') {
          verify(p, result);
          if (result.nodes > p.students.length) backtracked = true;
        } else assert.equal(result.assignment, null);
      }
    }
  }
  assert.ok(backtracked, 'oracle cases exercise successful backtracking');
});

test('browser scripts expose SeatCraft.solver without CommonJS or validator', () => {
  const context = vm.createContext({});
  vm.runInContext('self = this; window = this;', context);
  for (const filename of ['classroom.js', 'solver.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', filename), 'utf8'), context);
  }
  assert.equal(typeof context.window.SeatCraft.solver.solve, 'function');
  const p = problem(43);
  verify(p, context.window.SeatCraft.solver.solve(p));
});
