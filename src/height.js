(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SeatCraft = root.SeatCraft || {};
    root.SeatCraft.height = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 老師對身高只有模糊印象：偏高／普通（預設）／偏矮。身高是「盡量做到」的軟條件，
  // 只在不違反任何硬條件（不能坐在一起、指定位置）的前提下調整。
  const LEVEL = { tall: 1, short: -1 };
  const LEVEL_NAMES = { tall: '偏高', short: '偏矮' };
  const BLOCK_DEPTH = 2;  // 同一直排往後看幾個座位算「擋到」

  function levelOf(problem, id) {
    return LEVEL[(problem.heights || {})[id]] || 0;
  }

  // assignment：{ 學生號碼: seat index } → occ[seat index] = 學生號碼
  function occupancy(problem, assignment) {
    const occ = new Array(problem.classroom.seats.length).fill(null);
    for (const [id, seat] of Object.entries(assignment)) occ[seat] = Number(id);
    return occ;
  }

  // 後半部：有座位的列數取一半，中間那列算後半部（7 列 → 第 4～7 列）
  function backHalfStart(seats) {
    const minRow = seats.reduce((m, s) => Math.min(m, s.row), Infinity);
    const maxRow = seats.reduce((m, s) => Math.max(m, s.row), 0);
    return minRow + Math.floor((maxRow - minRow + 1) / 2);
  }

  // 分數越小越好，依序比較（Richard 的要求：偏高的坐後半部，且盡量不要坐在偏矮的前面）：
  //   notBack：沒坐在後半部的偏高學生人數
  //   blocks：同一直排中，偏高的坐在偏矮的前面（往後 1～2 個座位）的次數
  //   empties：空位離最後一列的距離總和（空位盡量留在後面）
  //   minor：偏高擋普通、普通擋偏矮的次數
  //   tilt：偏高的人越前面、偏矮的人越後面，分數越大
  function scoreOcc(problem, occ, collect) {
    const { seats, grid } = problem.classroom;
    const maxRow = seats.reduce((m, s) => Math.max(m, s.row), 0);
    const backStart = backHalfStart(seats);
    let notBack = 0, blocks = 0, empties = 0, minor = 0, tilt = 0;
    const pairs = [], front = [];
    for (const seat of seats) {
      const id = occ[seat.index];
      if (id == null) { empties += maxRow - seat.row; continue; }
      const level = levelOf(problem, id);
      tilt += level * (maxRow - seat.row);
      if (level > 0 && seat.row < backStart) {
        notBack++;
        if (collect) front.push({ id, seat: seat.index });
      }
      for (let d = 1; d <= BLOCK_DEPTH; d++) {
        const row = grid[seat.row + d];
        const behind = row ? row[seat.col] : null;
        if (behind == null || occ[behind] == null) continue;
        const diff = level - levelOf(problem, occ[behind]);
        if (diff === 2) {
          blocks++;
          if (collect) pairs.push({ front: id, back: occ[behind], frontSeat: seat.index, backSeat: behind });
        } else if (diff === 1) {
          minor++;
        }
      }
    }
    return { notBack, blocks, empties, minor, tilt, pairs, front };
  }

  function score(problem, assignment) {
    return scoreOcc(problem, occupancy(problem, assignment), true);
  }

  function better(a, b) {
    return a.notBack - b.notBack || a.blocks - b.blocks || a.empties - b.empties ||
      a.minor - b.minor || a.tilt - b.tilt;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 從合法的 assignment 出發，反覆嘗試「兩人互換」或「移到空位」，
  // 只接受不違反硬條件且分數變好的調整；同一個 seed 結果相同。
  function improve(problem, assignment, { seed = 1, maxPasses = 50 } = {}) {
    const { classroom } = problem;
    const zones = problem.zones || {};
    const occ = occupancy(problem, assignment);
    const peers = new Map();
    for (const group of problem.groups || []) {
      for (const a of group) {
        if (!peers.has(a)) peers.set(a, new Set());
        for (const b of group) if (a !== b) peers.get(a).add(b);
      }
    }
    const zoneSets = {};
    for (const [zone, list] of Object.entries(classroom.zones)) zoneSets[zone] = new Set(list);

    function fits(id, seat) {
      if (id == null) return true;
      const zone = zones[id];
      if (zone && !zoneSets[zone].has(seat)) return false;
      const mine = peers.get(id);
      if (!mine) return true;
      return classroom.adjacency[seat].every((n) => occ[n] == null || !mine.has(occ[n]));
    }

    const random = mulberry32(seed);
    const pairs = [];
    for (let i = 0; i < occ.length; i++) for (let j = i + 1; j < occ.length; j++) pairs.push([i, j]);
    let current = scoreOcc(problem, occ, false);

    for (let pass = 0; pass < maxPasses; pass++) {
      for (let k = pairs.length - 1; k > 0; k--) {
        const r = Math.floor(random() * (k + 1));
        [pairs[k], pairs[r]] = [pairs[r], pairs[k]];
      }
      let improved = false;
      for (const [i, j] of pairs) {
        const a = occ[i], b = occ[j];
        if (a == null && b == null) continue;
        occ[i] = b; occ[j] = a;
        if (fits(b, i) && fits(a, j)) {
          const next = scoreOcc(problem, occ, false);
          if (better(next, current) < 0) { current = next; improved = true; continue; }
        }
        occ[i] = a; occ[j] = b;
      }
      if (!improved) break;
    }

    const out = {};
    occ.forEach((id, seat) => { if (id != null) out[id] = seat; });
    return out;
  }

  return { LEVEL_NAMES, backHalfStart, score, improve };
});
