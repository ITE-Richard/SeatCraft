(function () {
  'use strict';

  const { classroom: C, validator: V, solver: S, rules: R, height: H } = window.SeatCraft;
  const STORAGE_KEY = 'seatcraft.v1';
  const RETRIES = 5;  // 搜尋額度用完時自動換幾個 seed 再試
  const MAX_SIZE = 15;  // 列數、排數上限

  const $ = (id) => document.getElementById(id);
  let state = loadLocal() || defaults();
  let editing = false;
  let selected = null;  // 手動調整時選取的格子位置 'row,col'
  const picked = new Set();  // 設定條件時點選的學生號碼

  function defaults() {
    // grid：老師設定的教室（列數、排數、X 格子）；seating：學生號碼 → 格子位置 'row,col'，
    // 用位置而非座位編號儲存，標記 X 後編號改變也不會錯位
    return { n: 30, names: '', zones: {}, heights: {}, groups: [], grid: copyGrid(C.DEFAULT_GRID), seed: 1, seating: null };
  }

  function copyGrid(g) {
    return { rows: g.rows, cols: g.cols, blocked: g.blocked.slice() };
  }

  function validGrid(g) {
    const size = (x) => Number.isInteger(x) && x >= 1 && x <= MAX_SIZE;
    return g && size(g.rows) && size(g.cols) && Array.isArray(g.blocked) &&
      g.blocked.every((k) => /^\d+,\d+$/.test(k));
  }

  function normalize(s) {
    const d = defaults();
    const out = {
      n: Number.isInteger(s.n) && s.n > 0 ? s.n : d.n,
      names: typeof s.names === 'string' ? s.names : '',
      zones: s.zones && typeof s.zones === 'object' ? s.zones : {},
      heights: s.heights && typeof s.heights === 'object' ? s.heights : {},
      groups: Array.isArray(s.groups) ? s.groups.filter(Array.isArray) : [],
      grid: validGrid(s.grid) ? copyGrid(s.grid) : d.grid,
      seed: Number.isInteger(s.seed) ? s.seed : 1,
      // 舊版以座位編號儲存的座位表無法對應到位置，直接捨棄
      seating: s.seating && typeof s.seating === 'object' &&
        Object.values(s.seating).every((v) => /^\d+,\d+$/.test(v)) ? s.seating : null,
    };
    return out;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 無痕模式等情況，忽略 */ }
  }

  // ---------- 資料轉換 ----------

  function nameList() {
    return state.names.split(/\r?\n/).map((s) => s.trim());
  }

  function students() {
    const names = nameList();
    const list = [];
    for (let id = 1; id <= state.n; id++) list.push({ id, name: names[id - 1] || '' });
    return list;
  }

  function nameOf(id) {
    return nameList()[id - 1] || '';
  }

  function layout() {
    return C.makeLayout(state.grid);
  }

  function room() {
    return C.buildClassroom(layout());
  }

  function posOf(seat) {
    return seat.row + ',' + seat.col;
  }

  function problem(classroom) {
    const zones = {};
    for (const [id, zone] of Object.entries(state.zones)) {
      if (Number(id) <= state.n && zone) zones[Number(id)] = zone;
    }
    const heights = {};
    for (const [id, h] of Object.entries(state.heights)) {
      if (Number(id) <= state.n && h) heights[Number(id)] = h;
    }
    return { classroom, students: students(), zones, heights, groups: state.groups.map((g) => g.slice()) };
  }

  function seatingToAssignment(classroom) {
    const byPos = new Map(classroom.seats.map((s) => [posOf(s), s.index]));
    const assignment = {};
    for (const [id, pos] of Object.entries(state.seating || {})) {
      if (Number(id) > state.n) continue;
      // 座位被標成 X 或超出教室時視為未入座，checkAssignment 會回報「尚未安排座位」
      if (byPos.has(pos)) assignment[Number(id)] = byPos.get(pos);
    }
    return assignment;
  }

  function occupantMap() {
    const map = new Map();
    for (const [id, pos] of Object.entries(state.seating || {})) {
      if (Number(id) <= state.n) map.set(pos, Number(id));
    }
    return map;
  }

  // ---------- 狀態訊息 ----------

  function setStatus(type, text) {
    const el = $('status');
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'status ' + type;
    el.textContent = text;
  }

  // ---------- 排座位 ----------

  function runSolve(newSeed) {
    if (newSeed) state.seed = (state.seed % 1000000) + 1;
    const classroom = room();
    const prob = problem(classroom);
    const blocking = V.staticCheck(prob).filter((i) => i.kind !== 'violation');
    if (blocking.length) {
      const head = blocking.some((i) => i.kind === 'input') ? '設定有誤，請修正：' : '這些限制無法同時滿足：';
      setStatus('error', head + '\n' + blocking.map((i) => '・' + i.message).join('\n'));
      return;
    }
    setStatus('warn', '排座位中…');
    setTimeout(() => {
      let result = null;
      for (let k = 0; k < RETRIES; k++) {
        result = S.solve(prob, { seed: state.seed + k });
        if (result.status !== 'UNKNOWN') { state.seed += k; break; }
      }
      if (result.status === 'FEASIBLE') {
        // 身高是軟條件：在不違反硬條件下調整（偏高坐後半部、偏高不擋偏矮、空位留後面）
        const assignment = H.improve(prob, result.assignment, { seed: state.seed });
        state.seating = {};
        for (const [id, idx] of Object.entries(assignment)) state.seating[id] = posOf(classroom.seats[idx]);
        selected = null;
        setStatus('ok', `完成（第 ${state.seed} 號排法）。點兩個座位可以互換；不滿意可按「再排一次」。`);
      } else if (result.status === 'INFEASIBLE') {
        setStatus('error', '這些限制無法同時滿足，請減少「不能坐在一起」的人數或指定位置的人數。');
      } else {
        setStatus('warn', '在搜尋上限內沒找到排法。請再按一次「再排一次」，或放寬一些限制。');
      }
      saveLocal();
      render();
    }, 20);
  }

  // ---------- 畫面 ----------

  function render() {
    renderChips();
    renderConditions();
    renderGrid();
  }

  function who(id) {
    return nameOf(id) ? `${id} ${nameOf(id)}` : `${id} 號`;
  }

  function groupsOf(id) {
    const out = [];
    state.groups.forEach((g, i) => { if (g.includes(id)) out.push(i + 1); });
    return out;
  }

  function renderChips() {
    const box = $('chips');
    box.textContent = '';
    for (const s of students()) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.dataset.id = s.id;
      if (picked.has(s.id)) chip.classList.add('picked');
      chip.append(span('num', String(s.id)));
      if (s.name) chip.append(span('name', s.name));
      const badges = [];
      if (state.zones[s.id]) badges.push(C.ZONE_NAMES[state.zones[s.id]]);
      if (state.heights[s.id]) badges.push(H.LEVEL_NAMES[state.heights[s.id]]);
      const gs = groupsOf(s.id);
      if (gs.length) badges.push('組' + gs.join(','));
      if (badges.length) {
        chip.classList.add('marked');
        chip.append(span('badge', badges.join(' ')));
        chip.title = badges.join('、');
      }
      box.append(chip);
    }
    const ids = [...picked].sort((a, b) => a - b);
    $('pick-count').textContent = ids.length ? `已選 ${ids.length} 人：${ids.join('、')}` : '尚未選取';
  }

  function renderConditions() {
    const groups = $('group-list');
    groups.textContent = '';
    state.groups.forEach((g, i) => {
      groups.append(condItem(`第 ${i + 1} 組：` + g.map(who).join('、'), { group: i }));
    });
    if (!state.groups.length) groups.append(emptyItem('還沒有設定'));

    const zones = $('zone-list');
    zones.textContent = '';
    const entries = Object.entries(state.zones)
      .map(([id, z]) => [Number(id), z])
      .filter(([id, z]) => id <= state.n && z)
      .sort((a, b) => C.ZONES.indexOf(a[1]) - C.ZONES.indexOf(b[1]) || a[0] - b[0]);
    for (const [id, z] of entries) zones.append(condItem(`${who(id)} → ${C.ZONE_NAMES[z]}`, { zone: id }));
    if (!entries.length) zones.append(emptyItem('還沒有設定'));

    const heights = $('height-list');
    heights.textContent = '';
    for (const level of ['tall', 'short']) {
      const ids = Object.keys(state.heights).map(Number)
        .filter((id) => id <= state.n && state.heights[id] === level).sort((a, b) => a - b);
      if (ids.length) heights.append(condItem(`${H.LEVEL_NAMES[level]}：` + ids.map(who).join('、'), { height: level }));
    }
    if (!heights.children.length) heights.append(emptyItem('還沒有設定（沒標的都算普通）'));
  }

  function condItem(text, data) {
    const li = document.createElement('li');
    const del = document.createElement('button');
    del.textContent = '刪除';
    Object.assign(del.dataset, data);
    li.append(span('', text), del);
    return li;
  }

  function emptyItem(text) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = text;
    return li;
  }

  function renderGrid() {
    const cells = layout().cells;
    const classroom = room();
    const occupants = occupantMap();
    const groupOf = new Map();
    state.groups.forEach((g, i) => g.forEach((id) => groupOf.set(id, (groupOf.get(id) || []).concat(i + 1))));

    // 違規標示
    const badSeats = new Set();
    const issueList = $('issue-list');
    issueList.textContent = '';
    if (state.seating) {
      const issues = V.checkAssignment(problem(classroom), seatingToAssignment(classroom));
      for (const issue of issues) {
        issue.seats.forEach((i) => classroom.seats[i] && badSeats.add(posOf(classroom.seats[i])));
        const li = document.createElement('li');
        li.textContent = issue.message;
        issueList.append(li);
      }
    }

    renderHeightReport(classroom);

    const grid = $('grid');
    grid.style.gridTemplateColumns = `repeat(${state.grid.cols}, minmax(0, 1fr))`;
    grid.textContent = '';
    for (let r = 0; r < state.grid.rows; r++) {
      for (let c = 0; c < state.grid.cols; c++) {
        const label = cells[r][c];
        const pos = r + ',' + c;
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.pos = pos;
        if (label == null) {
          cell.classList.add('off');
          if (editing) cell.classList.add('editable');
          cell.append(span('num', '×'));
          grid.append(cell);
          continue;
        }
        cell.classList.add('seat');
        cell.append(span('label', 'Seat ' + label));
        const id = occupants.get(pos);
        if (id != null) {
          cell.classList.add('filled');
          const tags = [];
          if (state.zones[id]) tags.push(C.ZONE_NAMES[state.zones[id]]);
          if (state.heights[id]) tags.push(state.heights[id] === 'tall' ? '高' : '矮');
          if (groupOf.has(id)) tags.push('組' + groupOf.get(id).join(','));
          if (tags.length) cell.append(span('tag', tags.join(' ')));
          cell.append(span('num', String(id)));
          if (nameOf(id)) cell.append(span('name', nameOf(id)));
        }
        if (badSeats.has(pos)) cell.classList.add('bad');
        if (selected === pos) cell.classList.add('selected');
        grid.append(cell);
      }
    }

    $('grid-hint').textContent = editing
      ? '編輯教室中：點格子標記 X（不坐學生），再點一次取消。完成後取消勾選「編輯教室」。'
      : state.seating ? '點一個座位，再點另一個座位即可互換（也可以移到空位）。' : `共 ${classroom.seats.length} 個座位。`;
  }

  function renderHeightReport(classroom) {
    const el = $('height-report');
    const prob = problem(classroom);
    if (!state.seating || !Object.keys(prob.heights).length) { el.hidden = true; return; }
    const s = H.score(prob, seatingToAssignment(classroom));
    const seatName = (i) => 'Seat ' + classroom.seats[i].label;
    const lines = [];
    if (s.front.length) {
      lines.push('偏高但沒坐在後半部：' + s.front.map((f) => `${who(f.id)}（${seatName(f.seat)}）`).join('、') +
        '。可能是其他條件限制了他的位置。');
    }
    if (s.pairs.length) {
      lines.push('偏高坐在偏矮前面：' + s.pairs.map((p) => `${who(p.front)} 擋到 ${who(p.back)}`).join('、') + '。');
    }
    el.hidden = false;
    el.className = 'height-report ' + (lines.length ? 'warn' : 'ok');
    el.textContent = lines.length ? '身高安排：\n' + lines.join('\n') : '身高安排：偏高的都在後半部，也沒有擋到偏矮的同學。';
  }

  function span(cls, text) {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  // ---------- 事件 ----------

  function onSeatClick(pos) {
    if (editing) {
      const set = new Set(state.grid.blocked);
      set.has(pos) ? set.delete(pos) : set.add(pos);
      state.grid.blocked = [...set];
      selected = null;
      saveLocal();
      renderGrid();
      return;
    }
    if (!state.seating || state.grid.blocked.includes(pos)) return;
    if (selected == null) { selected = pos; renderGrid(); return; }
    if (selected === pos) { selected = null; renderGrid(); return; }
    const occupants = occupantMap();
    const a = occupants.get(selected), b = occupants.get(pos);
    if (a != null) state.seating[a] = pos;
    if (b != null) state.seating[b] = selected;
    selected = null;
    saveLocal();
    renderGrid();
  }

  // 加入群組；相同成員的群組不重複加入。回傳是否有加入
  function addGroup(ids) {
    const sorted = ids.slice().sort((x, y) => x - y);
    const key = sorted.join(',');
    if (state.groups.some((g) => g.slice().sort((x, y) => x - y).join(',') === key)) return false;
    state.groups.push(sorted);
    return true;
  }

  function groupPicked() {
    const ids = [...picked];
    if (ids.length < 2) { setStatus('error', '請至少點選兩位學生。'); return; }
    if (!addGroup(ids)) setStatus('warn', '這一組已經設定過了。'); else setStatus(null);
    picked.clear();
    saveLocal();
    render();
  }

  function zonePicked(zone) {
    if (!picked.size) { setStatus('error', '請先點選學生。'); return; }
    for (const id of picked) {
      if (zone) state.zones[id] = zone; else delete state.zones[id];
    }
    picked.clear();
    setStatus(null);
    saveLocal();
    render();
  }

  function heightPicked(level) {
    if (!picked.size) { setStatus('error', '請先點選學生。'); return; }
    for (const id of picked) {
      if (level) state.heights[id] = level; else delete state.heights[id];
    }
    picked.clear();
    setStatus(null);
    saveLocal();
    render();
  }

  function parsePasted() {
    const result = R.parseRules($('inp-rules').value, { layout: layout() });
    const ul = $('parse-result');
    ul.textContent = '';
    let added = 0;
    const maxId = Math.max(0, ...result.groups.flat(), ...Object.keys(result.zones).map(Number),
      ...Object.keys(result.heights).map(Number));
    for (const entry of result.lines) {
      const li = document.createElement('li');
      if (entry.error) {
        li.className = 'err';
        li.textContent = `第 ${entry.line} 行「${entry.text}」：${entry.error}`;
      } else if (entry.group) {
        const ok = addGroup(entry.group);
        added += ok ? 1 : 0;
        li.textContent = `不能坐在一起：${entry.group.join('、')}` + (ok ? '' : '（已存在，略過）');
      } else if (entry.height) {
        entry.students.forEach((id) => { state.heights[id] = entry.height; });
        added += 1;
        li.textContent = `${entry.students.join('、')} 號 → 身高${H.LEVEL_NAMES[entry.height]}`;
      } else {
        entry.students.forEach((id) => { state.zones[id] = entry.zone; });
        added += 1;
        li.textContent = `${entry.students.join('、')} 號 → ${C.ZONE_NAMES[entry.zone]}`;
      }
      ul.append(li);
    }
    if (maxId > state.n) {
      state.n = maxId;
      $('inp-n').value = maxId;
      setStatus('warn', `條件中出現 ${maxId} 號，已把人數調整為 ${maxId}。`);
    }
    if (added && !result.lines.some((l) => l.error)) $('inp-rules').value = '';
    saveLocal();
    render();
  }

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 依教室形狀輸出二維表格；cellText(pos) 決定格子內容
  function tableRows(cellText) {
    const { cells } = layout();
    const header = [''].concat(Array.from({ length: state.grid.cols }, (_, c) => `第${c + 1}排`));
    const rows = [header];
    for (let r = 0; r < state.grid.rows; r++) {
      const row = [`第${r + 1}列`];
      for (let c = 0; c < state.grid.cols; c++) {
        row.push(cells[r][c] == null ? '×' : cellText(r + ',' + c));
      }
      rows.push(row);
    }
    return rows;
  }

  function seatText(pos) {
    const id = occupantMap().get(pos);
    if (id == null) return '—';
    return nameOf(id) ? `${id} ${nameOf(id)}` : String(id);
  }

  function requireSeating() {
    if (state.seating) return true;
    setStatus('warn', '請先按「排座位」。');
    return false;
  }

  function exportCsv() {
    if (!requireSeating()) return;
    const quote = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    const lines = [['講桌（前方）'], ...tableRows(seatText)].map((r) => r.map(quote).join(','));
    download('座位表.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  function exportMarkdown() {
    if (!requireSeating()) return;
    const rows = tableRows(seatText);
    const md = ['**講桌（前方）**', '', '| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => '---').join('|') + '|']
      .concat(rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |'));
    download('座位表.md', md.join('\n') + '\n', 'text/markdown;charset=utf-8');
  }

  function saveFile() {
    download('座位設定.json', JSON.stringify({ app: 'SeatCraft', version: 1, ...state }, null, 2), 'application/json');
  }

  function loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.app !== 'SeatCraft') throw new Error('not seatcraft');
        state = normalize(data);
        syncInputs();
        saveLocal();
        render();
        setStatus('ok', '已載入設定。');
      } catch (e) {
        setStatus('error', '這個檔案不是 SeatCraft 的設定檔。');
      }
    };
    reader.readAsText(file);
  }

  function syncInputs() {
    $('inp-rows').value = state.grid.rows;
    $('inp-cols').value = state.grid.cols;
    $('inp-n').value = state.n;
    $('inp-names').value = state.names;
    $('chk-edit').checked = editing;
  }

  // 改列數或排數：超出範圍的 X 格子一併移除；座位表保留，超出教室的學生會顯示「尚未安排座位」
  function onGridSize(e) {
    const value = parseInt(e.target.value, 10);
    const key = e.target.id === 'inp-rows' ? 'rows' : 'cols';
    if (!Number.isInteger(value) || value < 1 || value > MAX_SIZE) {
      e.target.value = state.grid[key];
      setStatus('error', `列數與排數請輸入 1 到 ${MAX_SIZE}。`);
      return;
    }
    state.grid[key] = value;
    state.grid.blocked = state.grid.blocked.filter((k) => {
      const [r, c] = k.split(',').map(Number);
      return r < state.grid.rows && c < state.grid.cols;
    });
    selected = null;
    setStatus(null);
    saveLocal();
    renderGrid();
  }

  function bind() {
    $('btn-help').addEventListener('click', () => $('help').showModal());
    $('btn-help-close').addEventListener('click', () => $('help').close());
    $('help').addEventListener('click', (e) => { if (e.target === $('help')) $('help').close(); });
    $('inp-rows').addEventListener('change', onGridSize);
    $('inp-cols').addEventListener('change', onGridSize);
    $('inp-n').addEventListener('change', (e) => {
      const n = parseInt(e.target.value, 10);
      if (!Number.isInteger(n) || n < 1) { e.target.value = state.n; return; }
      state.n = n;
      saveLocal();
      render();
    });
    $('inp-names').addEventListener('change', (e) => {
      state.names = e.target.value;
      const count = nameList().filter(Boolean).length;
      if (count > state.n) { state.n = count; $('inp-n').value = count; }
      saveLocal();
      render();
    });
    $('chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const id = Number(chip.dataset.id);
      picked.has(id) ? picked.delete(id) : picked.add(id);
      renderChips();
    });
    $('btn-group').addEventListener('click', groupPicked);
    document.querySelector('.pick-zone').addEventListener('click', (e) => {
      if (e.target.dataset.zone != null) zonePicked(e.target.dataset.zone);
    });
    document.querySelector('.pick-height').addEventListener('click', (e) => {
      if (e.target.dataset.height != null) heightPicked(e.target.dataset.height);
    });
    $('height-list').addEventListener('click', (e) => {
      const level = e.target.dataset.height;
      if (!level) return;
      for (const id of Object.keys(state.heights)) if (state.heights[id] === level) delete state.heights[id];
      saveLocal();
      render();
    });
    $('btn-clear-pick').addEventListener('click', () => { picked.clear(); renderChips(); });
    $('btn-parse').addEventListener('click', parsePasted);
    $('group-list').addEventListener('click', (e) => {
      if (e.target.dataset.group == null) return;
      state.groups.splice(Number(e.target.dataset.group), 1);
      saveLocal();
      render();
    });
    $('zone-list').addEventListener('click', (e) => {
      if (e.target.dataset.zone == null) return;
      delete state.zones[e.target.dataset.zone];
      saveLocal();
      render();
    });
    $('grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (cell && cell.dataset.pos) onSeatClick(cell.dataset.pos);
    });
    $('chk-edit').addEventListener('change', (e) => { editing = e.target.checked; selected = null; renderGrid(); });
    $('btn-solve').addEventListener('click', () => runSolve(false));
    $('btn-reroll').addEventListener('click', () => runSolve(true));
    $('btn-print').addEventListener('click', () => { if (requireSeating()) window.print(); });
    $('btn-csv').addEventListener('click', exportCsv);
    $('btn-md').addEventListener('click', exportMarkdown);
    $('btn-save').addEventListener('click', saveFile);
    $('btn-load').addEventListener('click', () => $('file-load').click());
    $('file-load').addEventListener('change', (e) => {
      if (e.target.files[0]) loadFile(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-reset').addEventListener('click', () => {
      if (!confirm('確定要清除所有設定與座位表嗎？')) return;
      state = defaults();
      selected = null;
      syncInputs();
      saveLocal();
      setStatus(null);
      render();
    });
  }

  syncInputs();
  bind();
  render();
})();
