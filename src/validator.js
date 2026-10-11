(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./classroom.js'));
  } else {
    root.SeatCraft = root.SeatCraft || {};
    root.SeatCraft.validator = factory(root.SeatCraft.classroom);
  }
})(typeof self !== 'undefined' ? self : this, function (classroom) {
  'use strict';

  const CODES = {
    // input
    NO_STUDENTS: 'NO_STUDENTS',
    INVALID_STUDENT_ID: 'INVALID_STUDENT_ID',
    DUPLICATE_STUDENT_ID: 'DUPLICATE_STUDENT_ID',
    INVALID_GROUP_SIZE: 'INVALID_GROUP_SIZE',
    GROUP_STUDENT_NOT_FOUND: 'GROUP_STUDENT_NOT_FOUND',
    INVALID_ZONE_NAME: 'INVALID_ZONE_NAME',
    ZONE_STUDENT_NOT_FOUND: 'ZONE_STUDENT_NOT_FOUND',

    // infeasible
    TOO_MANY_STUDENTS: 'TOO_MANY_STUDENTS',
    ZONE_EMPTY: 'ZONE_EMPTY',
    ZONE_OVER_CAPACITY: 'ZONE_OVER_CAPACITY',
    GROUP_OVER_CAPACITY: 'GROUP_OVER_CAPACITY',
    GROUP_ZONE_OVER_CAPACITY: 'GROUP_ZONE_OVER_CAPACITY',

    // violation
    STUDENT_UNASSIGNED: 'STUDENT_UNASSIGNED',
    INVALID_SEAT: 'INVALID_SEAT',
    DUPLICATE_SEAT: 'DUPLICATE_SEAT',
    ZONE_VIOLATION: 'ZONE_VIOLATION',
    ADJACENT_IN_GROUP: 'ADJACENT_IN_GROUP',
  };

  /**
   * 計算給定座位子集誘發子圖的最大獨立集大小（最大不相鄰座位數）。
   * 採用精確分支界限法：
   * 1. 候選集合以 BigInt 位元遮罩表示。
   * 2. 度數為 0 或 1 的頂點直接選取（度數 0 無衝突必選；度數 1 選取它不劣於選取其鄰居）。
   * 3. 其餘情況挑選度數最大頂點進行二分支（選 vs 不選），並配合記憶化（Memoization）剪枝。
   */
  function maxIndependentSetSize(cr, seatIndices) {
    if (!seatIndices || seatIndices.length === 0) return 0;
    const uniqueSeats = Array.from(new Set(seatIndices)).filter(
      (idx) => idx != null && cr.seats[idx] != null
    );
    const m = uniqueSeats.length;
    if (m <= 1) return m;

    const seatToIdx = new Map();
    uniqueSeats.forEach((s, i) => seatToIdx.set(s, i));

    const adj = new Array(m);
    for (let i = 0; i < m; i++) {
      let mask = 0n;
      const s = uniqueSeats[i];
      const neighbors = cr.adjacency[s] || [];
      for (let j = 0; j < neighbors.length; j++) {
        const nIdx = seatToIdx.get(neighbors[j]);
        if (nIdx !== undefined) {
          mask |= 1n << BigInt(nIdx);
        }
      }
      adj[i] = mask;
    }

    const memo = new Map();

    function solve(candidates) {
      if (candidates === 0n) return 0;
      const cached = memo.get(candidates);
      if (cached !== undefined) return cached;

      let minDeg = Infinity;
      let minV = -1;
      let maxDeg = -1;
      let maxV = -1;

      for (let i = 0; i < m; i++) {
        const bit = 1n << BigInt(i);
        if ((candidates & bit) !== 0n) {
          let deg = 0;
          let temp = candidates & adj[i];
          while (temp > 0n) {
            temp &= temp - 1n;
            deg++;
          }

          if (deg === 0) {
            const res = 1 + solve(candidates ^ bit);
            memo.set(candidates, res);
            return res;
          }

          if (deg < minDeg) {
            minDeg = deg;
            minV = i;
          }
          if (deg > maxDeg) {
            maxDeg = deg;
            maxV = i;
          }
        }
      }

      if (minDeg === 1) {
        const bitMin = 1n << BigInt(minV);
        const nbrMask = candidates & adj[minV];
        const nextCand = candidates & ~(bitMin | nbrMask);
        const res = 1 + solve(nextCand);
        memo.set(candidates, res);
        return res;
      }

      const bitMax = 1n << BigInt(maxV);
      const nbrMax = candidates & adj[maxV];

      // 分支 1：選取 maxV（排除 maxV 及其所有鄰居）
      const pick = 1 + solve(candidates & ~(bitMax | nbrMax));

      // 分支 2：不選 maxV（僅排除 maxV）
      const notPick = solve(candidates ^ bitMax);

      const res = pick > notPick ? pick : notPick;
      memo.set(candidates, res);
      return res;
    }

    const allMask = (1n << BigInt(m)) - 1n;
    return solve(allMask);
  }

  function getSeatLabel(cr, seatIdx) {
    const seat = cr.seats[seatIdx];
    return seat ? `Seat ${seat.label}` : `Seat #${seatIdx}`;
  }

  function getZoneDisplayName(zone) {
    return (classroom.ZONE_NAMES && classroom.ZONE_NAMES[zone]) || zone;
  }

  function staticCheck(problem) {
    const issues = [];
    if (!problem) return issues;
    const cr = problem.classroom;
    const students = problem.students || [];
    const zones = problem.zones || {};
    const groups = problem.groups || [];

    // --- 1. 輸入檢查 (kind: 'input') ---
    if (!Array.isArray(students) || students.length < 1) {
      issues.push({
        kind: 'input',
        code: CODES.NO_STUDENTS,
        message: '學生人數必須至少為 1 位。',
        students: [],
        seats: [],
      });
      return issues;
    }

    const studentIds = new Set();
    const duplicateIds = new Set();

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      if (!s || typeof s.id !== 'number' || !Number.isInteger(s.id) || s.id <= 0) {
        issues.push({
          kind: 'input',
          code: CODES.INVALID_STUDENT_ID,
          message: `學生編號必須為大於 0 的整數（發現：${s ? s.id : s}）。`,
          students: s && s.id != null ? [s.id] : [],
          seats: [],
        });
      } else if (studentIds.has(s.id)) {
        duplicateIds.add(s.id);
      } else {
        studentIds.add(s.id);
      }
    }

    if (duplicateIds.size > 0) {
      duplicateIds.forEach((id) => {
        issues.push({
          kind: 'input',
          code: CODES.DUPLICATE_STUDENT_ID,
          message: `第 ${id} 號學生的編號重複出現。`,
          students: [id],
          seats: [],
        });
      });
    }

    // 檢查群組輸入
    if (Array.isArray(groups)) {
      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        if (!Array.isArray(group) || group.length < 2) {
          issues.push({
            kind: 'input',
            code: CODES.INVALID_GROUP_SIZE,
            message: '不相鄰群組成員少於 2 人。',
            students: Array.isArray(group) ? group.filter((id) => typeof id === 'number') : [],
            seats: [],
          });
          continue;
        }

        const uniqueMembers = Array.from(new Set(group));
        if (uniqueMembers.length < 2) {
          issues.push({
            kind: 'input',
            code: CODES.INVALID_GROUP_SIZE,
            message: '不相鄰群組的有效不同學生成員少於 2 人。',
            students: uniqueMembers.filter((id) => typeof id === 'number'),
            seats: [],
          });
        }

        const missing = group.filter((id) => !studentIds.has(id));
        if (missing.length > 0) {
          issues.push({
            kind: 'input',
            code: CODES.GROUP_STUDENT_NOT_FOUND,
            message: `群組包含不存在的學生編號：${missing.join('、')}。`,
            students: missing,
            seats: [],
          });
        }
      }
    }

    // 檢查區域輸入
    if (zones && typeof zones === 'object') {
      const allowedZones = classroom.ZONES || ['front', 'back', 'left', 'right'];
      for (const [sIdStr, zoneName] of Object.entries(zones)) {
        const sId = Number(sIdStr);
        if (!studentIds.has(sId)) {
          issues.push({
            kind: 'input',
            code: CODES.ZONE_STUDENT_NOT_FOUND,
            message: `位置限制指派給不存在的學生編號 ${sId}。`,
            students: [sId],
            seats: [],
          });
        }
        if (!allowedZones.includes(zoneName)) {
          issues.push({
            kind: 'input',
            code: CODES.INVALID_ZONE_NAME,
            message: `不合法的位置限制「${zoneName}」，只能為第一列、最後一列、最左排或最右排。`,
            students: studentIds.has(sId) ? [sId] : [],
            seats: [],
          });
        }
      }
    }

    // 若有任何 input 格式錯誤，先返回
    if (issues.length > 0) {
      return issues;
    }

    if (!cr || !Array.isArray(cr.seats)) {
      return issues;
    }

    // --- 2. 證明矛盾檢查 (kind: 'infeasible') ---

    // 2.1 學生數 > 座位數
    if (students.length > cr.seats.length) {
      issues.push({
        kind: 'infeasible',
        code: CODES.TOO_MANY_STUDENTS,
        message: `學生人數（${students.length} 人）超過可用座位數（${cr.seats.length} 個）。`,
        students: students.map((s) => s.id),
        seats: cr.seats.map((s) => s.index),
      });
    }

    // 2.2 區域容量檢查
    const allowedZones = classroom.ZONES || ['front', 'back', 'left', 'right'];
    for (const z of allowedZones) {
      const studentsInZone = students.filter((s) => zones[s.id] === z);
      const seatsInZone = (cr.zones && cr.zones[z]) || [];
      if (studentsInZone.length > 0 && seatsInZone.length === 0) {
        issues.push({
          kind: 'infeasible',
          code: CODES.ZONE_EMPTY,
          message: `指定坐「${getZoneDisplayName(z)}」的有 ${studentsInZone.length} 人，但該區沒有可用座位。`,
          students: studentsInZone.map((s) => s.id),
          seats: [],
        });
      } else if (studentsInZone.length > seatsInZone.length) {
        issues.push({
          kind: 'infeasible',
          code: CODES.ZONE_OVER_CAPACITY,
          message: `指定坐「${getZoneDisplayName(z)}」的有 ${studentsInZone.length} 人，但${getZoneDisplayName(z)}只有 ${seatsInZone.length} 個座位。`,
          students: studentsInZone.map((s) => s.id),
          seats: [...seatsInZone],
        });
      }
    }

    // 2.3 群組最大不相鄰座位數檢查
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      const memberIds = Array.from(new Set(group));

      // 群組可用座位判定：
      // 組內成員若都有區域限制，就是那些區域座位的聯集；只要有一人沒限制就是全部座位。
      const allHaveZone = memberIds.every((id) => zones[id] != null);
      let availableSeats;
      if (allHaveZone) {
        const unionSet = new Set();
        for (const id of memberIds) {
          const z = zones[id];
          const zSeats = (cr.zones && cr.zones[z]) || [];
          for (const s of zSeats) unionSet.add(s);
        }
        availableSeats = Array.from(unionSet).sort((a, b) => a - b);
      } else {
        availableSeats = cr.seats.map((s) => s.index);
      }

      const maxSeats = maxIndependentSetSize(cr, availableSeats);
      if (memberIds.length > maxSeats) {
        issues.push({
          kind: 'infeasible',
          code: CODES.GROUP_OVER_CAPACITY,
          message: `第 ${memberIds.join('、')} 號等 ${memberIds.length} 位學生在同一組，但其可用座位最多只能容納 ${maxSeats} 個不相鄰座位。`,
          students: [...memberIds],
          seats: availableSeats,
        });
      }

      // 檢查：同群組中指定同一區的人數 > 該區的最大不相鄰座位數
      for (const z of allowedZones) {
        const groupMembersInZ = memberIds.filter((id) => zones[id] === z);
        if (groupMembersInZ.length > 1) {
          const zoneSeats = (cr.zones && cr.zones[z]) || [];
          const maxZoneIndependent = maxIndependentSetSize(cr, zoneSeats);
          if (groupMembersInZ.length > maxZoneIndependent) {
            issues.push({
              kind: 'infeasible',
              code: CODES.GROUP_ZONE_OVER_CAPACITY,
              message: `第 ${groupMembersInZ.join('、')} 號學生在同一組且指定坐「${getZoneDisplayName(z)}」，但該區最多只能容納 ${maxZoneIndependent} 個不相鄰座位。`,
              students: [...groupMembersInZ],
              seats: [...zoneSeats],
            });
          }
        }
      }
    }

    return issues;
  }

  function checkAssignment(problem, assignment) {
    const issues = [];
    if (!problem || !problem.classroom) return issues;
    const cr = problem.classroom;
    const students = problem.students || [];
    const zones = problem.zones || {};
    const groups = problem.groups || [];
    const assignMap = assignment || {};

    const seatOccupants = new Map(); // seatIndex -> studentId[]

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const sId = s.id;
      const seatIdx = assignMap[sId];

      // 1. 學生未入座
      if (seatIdx == null) {
        issues.push({
          kind: 'violation',
          code: CODES.STUDENT_UNASSIGNED,
          message: `第 ${sId} 號學生${s.name ? `（${s.name}）` : ''}尚未安排座位。`,
          students: [sId],
          seats: [],
        });
        continue;
      }

      // 2. 指到不存在或已停用的座位
      const seatObj = cr.seats[seatIdx];
      if (!seatObj || seatObj.index !== seatIdx) {
        issues.push({
          kind: 'violation',
          code: CODES.INVALID_SEAT,
          message: `第 ${sId} 號學生被分配到不存在或已停用的座位（索引 ${seatIdx}）。`,
          students: [sId],
          seats: [seatIdx],
        });
        continue;
      }

      // 記錄座位使用者，稍後檢查重複
      if (!seatOccupants.has(seatIdx)) {
        seatOccupants.set(seatIdx, []);
      }
      seatOccupants.get(seatIdx).push(sId);

      // 3. 區域違規
      const reqZone = zones[sId];
      if (reqZone) {
        const zoneSeats = (cr.zones && cr.zones[reqZone]) || [];
        if (!zoneSeats.includes(seatIdx)) {
          issues.push({
            kind: 'violation',
            code: CODES.ZONE_VIOLATION,
            message: `第 ${sId} 號學生指定坐「${getZoneDisplayName(reqZone)}」，但目前被安排在 ${getSeatLabel(cr, seatIdx)}。`,
            students: [sId],
            seats: [seatIdx],
          });
        }
      }
    }

    // 4. 兩人同座
    for (const [seatIdx, occupantIds] of seatOccupants.entries()) {
      if (occupantIds.length > 1) {
        const sortedIds = [...occupantIds].sort((a, b) => a - b);
        issues.push({
          kind: 'violation',
          code: CODES.DUPLICATE_SEAT,
          message: `第 ${sortedIds.join('、')} 號學生被分配到同一個座位 ${getSeatLabel(cr, seatIdx)}。`,
          students: sortedIds,
          seats: [seatIdx],
        });
      }
    }

    // 5. 群組相鄰（每對相鄰只回報一次）
    const reportedPairs = new Set();
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g] || [];
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const s1 = Math.min(group[i], group[j]);
          const s2 = Math.max(group[i], group[j]);
          const pairKey = `${s1}:${s2}`;
          if (reportedPairs.has(pairKey)) continue;

          const seat1 = assignMap[s1];
          const seat2 = assignMap[s2];
          if (
            seat1 != null &&
            seat2 != null &&
            cr.seats[seat1] != null &&
            cr.seats[seat2] != null
          ) {
            if (classroom.isAdjacent(cr, seat1, seat2)) {
              reportedPairs.add(pairKey);
              issues.push({
                kind: 'violation',
                code: CODES.ADJACENT_IN_GROUP,
                message: `第 ${s1}、${s2} 號學生在同一組，但座位 ${getSeatLabel(cr, seat1)} 和 ${getSeatLabel(cr, seat2)} 相鄰。`,
                students: [s1, s2],
                seats: [seat1, seat2].sort((a, b) => a - b),
              });
            }
          }
        }
      }
    }

    return issues;
  }

  return {
    CODES,
    maxIndependentSetSize,
    staticCheck,
    checkAssignment,
  };
});
