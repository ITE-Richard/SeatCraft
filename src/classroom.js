(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SeatCraft = root.SeatCraft || {};
    root.SeatCraft.classroom = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 教室內座位.md 的形狀；row 0 最靠講桌，col 0 為學生面向講桌時的最左
  const DEFAULT_LAYOUT = {
    rows: 7,
    cols: 7,
    cells: [
      ['01', '02', '03', '04', '05', '06', '07'],
      ['08', '09', '10', '11', '12', '13', '14'],
      ['15', '16', '17', '18', '19', '20', '21'],
      ['22', '23', '24', '25', '26', '27', '28'],
      ['29', '30', '31', '32', '33', '34', '35'],
      [null, '36', '37', '38', '39', '40', '41'],
      [null, null, null, null, '42', null, '43'],
    ],
  };

  // 老師在介面上設定的教室：幾列（前後）× 幾排（左右），blocked 為不坐學生的格子 'row,col'（0-based）
  const DEFAULT_GRID = { rows: 7, cols: 7, blocked: ['5,0', '6,0', '6,1', '6,2', '6,3', '6,5'] };

  // 由列數、排數與 X 格子產生 layout；座位依由前到後、由左到右編號 01、02…，X 格子不編號
  function makeLayout(grid) {
    const blocked = new Set(grid.blocked || []);
    const total = grid.rows * grid.cols - blocked.size;
    const width = Math.max(2, String(total).length);
    let next = 1;
    const cells = [];
    for (let r = 0; r < grid.rows; r++) {
      cells.push([]);
      for (let c = 0; c < grid.cols; c++) {
        cells[r].push(blocked.has(r + ',' + c) ? null : String(next++).padStart(width, '0'));
      }
    }
    return { rows: grid.rows, cols: grid.cols, cells };
  }

  const ZONES = ['front', 'back', 'left', 'right'];
  const ZONE_NAMES = { front: '第一列', back: '最後一列', left: '最左排', right: '最右排' };

  function buildClassroom(layout, disabledLabels) {
    const disabled = new Set(disabledLabels || []);
    const { rows, cols, cells } = layout;
    const seats = [];
    const grid = [];
    // 區域依 layout 幾何決定，停用座位不會讓區域移動
    let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;

    for (let r = 0; r < rows; r++) {
      grid.push(new Array(cols).fill(null));
      for (let c = 0; c < cols; c++) {
        const label = cells[r] && cells[r][c];
        if (label == null) continue;
        minRow = Math.min(minRow, r);
        maxRow = Math.max(maxRow, r);
        minCol = Math.min(minCol, c);
        maxCol = Math.max(maxCol, c);
        if (disabled.has(label)) continue;
        grid[r][c] = seats.length;
        seats.push({ index: seats.length, label: String(label), row: r, col: c });
      }
    }

    const zones = {
      front: seats.filter((s) => s.row === minRow).map((s) => s.index),
      back: seats.filter((s) => s.row === maxRow).map((s) => s.index),
      left: seats.filter((s) => s.col === minCol).map((s) => s.index),
      right: seats.filter((s) => s.col === maxCol).map((s) => s.index),
    };

    const adjacency = seats.map((s) => {
      const list = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const row = grid[s.row + dr];
          const n = row ? row[s.col + dc] : null;
          if (n != null) list.push(n);
        }
      }
      return list.sort((a, b) => a - b);
    });

    return { rows, cols, seats, grid, zones, adjacency };
  }

  function isAdjacent(classroom, a, b) {
    const sa = classroom.seats[a], sb = classroom.seats[b];
    return a !== b && Math.max(Math.abs(sa.row - sb.row), Math.abs(sa.col - sb.col)) === 1;
  }

  return { DEFAULT_LAYOUT, DEFAULT_GRID, ZONES, ZONE_NAMES, makeLayout, buildClassroom, isAdjacent };
});
