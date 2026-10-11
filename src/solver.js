(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./classroom.js'));
  } else {
    root.SeatCraft = root.SeatCraft || {};
    root.SeatCraft.solver = factory(root.SeatCraft.classroom);
  }
})(typeof self !== 'undefined' ? self : this, function (classroom) {
  'use strict';

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Luby 序列（1, 1, 2, 1, 1, 2, 4, …），i 從 1 開始
  function luby(i) {
    let k = 1;
    while ((1 << k) - 1 < i) k++;
    return (1 << k) - 1 === i ? 1 << (k - 1) : luby(i - (1 << (k - 1)) + 1);
  }

  // 每輪重新開始的基本節點數；回溯在困難輸入上有重尾現象，換順序重來比硬搜快得多
  const RESTART_BASE = 64;

  // Input validation belongs to the caller; no validator dependency is needed.
  function solve(problem, { seed = 1, maxNodes = 200000 } = {}) {
    if (!Number.isSafeInteger(maxNodes) || maxNodes < 0) {
      throw new RangeError('maxNodes 必須是非負安全整數');
    }
    const { classroom: room, students, zones = {}, groups = [] } = problem;
    const count = students.length;
    const studentIndex = new Map(students.map((student, i) => [student.id, i]));
    const peers = Array.from({ length: count }, () => new Set());
    for (const group of groups) {
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
          const i = studentIndex.get(group[a]), j = studentIndex.get(group[b]);
          if (i === j) continue;
          peers[i].add(j);
          peers[j].add(i);
        }
      }
    }
    const adjacent = room.adjacency.map((neighbors) => new Set(neighbors));
    const allSeats = room.seats.map((seat) => seat.index);
    let tieBreak, domains;
    function prepare(random) {
      tieBreak = students.map(() => random());
      domains = students.map((student) => {
      const zone = zones[student.id];
      const candidates = (zone === undefined ? allSeats : room.zones[zone]).slice();
      const priority = room.seats.map(() => random());
      // Fixed random keys keep sorting deterministic. Front rows take priority;
      // this is a soft preference, so every legal rear seat remains searchable.
      return candidates.sort((a, b) => room.seats[a].row - room.seats[b].row ||
        priority[a] - priority[b] || a - b);
      });
    }
    const chosen = new Array(count).fill(-1);
    let nodes = 0, limit = 0;

    function search(current, remaining) {
      if (remaining === 0) return 'FEASIBLE';
      let next = -1, bestSize = Infinity, bestDegree = -1;
      const available = new Set();
      for (let i = 0; i < count; i++) {
        if (chosen[i] !== -1) continue;
        const size = current[i].length;
        if (size === 0) return 'INFEASIBLE';
        for (const seat of current[i]) available.add(seat);
        let degree = 0;
        for (const peer of peers[i]) if (chosen[peer] === -1) degree++;
        if (size < bestSize || (size === bestSize && (degree > bestDegree ||
            (degree === bestDegree && tieBreak[i] < tieBreak[next])))) {
          next = i;
          bestSize = size;
          bestDegree = degree;
        }
      }
      // Pigeonhole proof: pruning this subtree cannot discard a solution.
      if (available.size < remaining) return 'INFEASIBLE';

      for (const seat of current[next]) {
        // A node is one attempted student/seat placement, including failures.
        // Check only when another branch is needed: exhausting the final branch
        // exactly at the limit still proves INFEASIBLE (or returns FEASIBLE).
        if (nodes >= limit) return 'UNKNOWN';
        nodes++;
        chosen[next] = seat;
        const child = current.slice();
        let possible = true;
        for (let i = 0; i < count; i++) {
          if (chosen[i] !== -1) continue;
          const separated = peers[next].has(i);
          child[i] = current[i].filter((candidate) => candidate !== seat &&
            (!separated || !adjacent[seat].has(candidate)));
          if (child[i].length === 0) {
            possible = false;
            break;
          }
        }
        const status = possible ? search(child, remaining - 1) : 'INFEASIBLE';
        if (status === 'FEASIBLE') return status;
        chosen[next] = -1;
        if (status === 'UNKNOWN') return status;
      }
      return 'INFEASIBLE';
    }

    // 第 0 輪沿用 seed 本身；之後每輪用衍生的 seed 重新打亂順序。
    // 只有未被截斷、完整搜完的一輪回傳 INFEASIBLE，才算證明無解。
    let status;
    for (let round = 0; ; round++) {
      limit = Math.min(maxNodes, nodes + RESTART_BASE * luby(round + 1));
      prepare(mulberry32(round === 0 ? seed : (seed ^ Math.imul(round, 0x9E3779B1)) >>> 0));
      chosen.fill(-1);
      status = search(domains, count);
      if (status !== 'UNKNOWN' || nodes >= maxNodes) break;
    }
    const assignment = status === 'FEASIBLE' ? {} : null;
    if (assignment !== null) {
      students.forEach((student, i) => { assignment[student.id] = chosen[i]; });
    }
    return { status, assignment, nodes };
  }

  return { solve };
});
