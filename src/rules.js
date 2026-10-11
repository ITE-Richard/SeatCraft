(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./classroom.js'));
  } else {
    root.SeatCraft = root.SeatCraft || {};
    root.SeatCraft.rules = factory(root.SeatCraft.classroom);
  }
})(typeof self !== 'undefined' ? self : this, function (classroom) {
  'use strict';

  // 把老師貼上的條件文字轉成群組與位置限制，例如：
  //   「15號, 14號不能一起坐」→ 群組 [14, 15]
  //   「24坐第一列」→ 24 號：front
  //   「3, 7, 12 比較高」→ 身高印象：tall
  // 用詞照老師的習慣：「列」是前後（橫），「排」是左右（直）。

  const CN_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const SEPARATE_WORDS = /不能|不可|不要|不得|別|分開|隔開|不相鄰|不能相鄰|愛講話|吵/;
  const HEIGHT_WORDS = [[/高/, 'tall'], [/矮/, 'short']];

  function cnToInt(s) {
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (s === '十') return 10;
    if (s.length === 2 && s[0] === '十') return 10 + CN_DIGITS[s[1]];
    if (s.length === 2 && s[1] === '十') return CN_DIGITS[s[0]] * 10;
    if (s.length === 3 && s[1] === '十') return CN_DIGITS[s[0]] * 10 + CN_DIGITS[s[2]];
    return CN_DIGITS[s] || NaN;
  }

  // 找出句中的位置描述；回傳 { zone, rest }，rest 為去掉位置描述後的文字
  function findZone(text, layout) {
    const lastRow = layout.rows, lastCol = layout.cols;
    const patterns = [
      [/最前面?一?[列排]?|最前列/, () => 'front'],
      [/最後面?一?[列排]?|最後一列/, () => 'back'],
      [/最左[邊側]?[那一]*[排行]?/, () => 'left'],
      [/最右[邊側]?[那一]*[排行]?/, () => 'right'],
      [/第\s*([0-9一二三四五六七八九十]+)\s*列/, (m) => {
        const k = cnToInt(m[1]);
        return k === 1 ? 'front' : k === lastRow ? 'back' : { error: `第${k}列不是第一列或最後一列（第${lastRow}列）` };
      }],
      [/第\s*([0-9一二三四五六七八九十]+)\s*排/, (m) => {
        const k = cnToInt(m[1]);
        return k === 1 ? 'left' : k === lastCol ? 'right' : { error: `第${k}排不是最左排或最右排（第${lastCol}排）` };
      }],
    ];
    for (const [re, toZone] of patterns) {
      const m = text.match(re);
      if (m) return { zone: toZone(m), rest: text.replace(m[0], ' ') };
    }
    return null;
  }

  function parseRules(text, options) {
    const layout = (options && options.layout) || classroom.DEFAULT_LAYOUT;
    const groups = [];
    const zones = {};
    const heights = {};
    const lines = [];

    text.split(/\r?\n/).forEach((raw, i) => {
      // 去掉行首的項目編號：「8.」「3)」「（2）」
      const line = raw.trim().replace(/^[(（]\s*\d+\s*[)）]\s*|^\d+\s*[.)）．]\s*/, '');
      if (!line) return;
      const entry = { line: i + 1, text: raw.trim() };
      lines.push(entry);

      const found = findZone(line, layout);
      if (found) {
        if (typeof found.zone === 'object') { entry.error = found.zone.error; return; }
        const ids = numbers(found.rest);
        if (!ids.length) { entry.error = '找不到學生號碼'; return; }
        ids.forEach((id) => { zones[id] = found.zone; });
        entry.zone = found.zone;
        entry.students = ids;
        return;
      }
      if (SEPARATE_WORDS.test(line)) {
        const ids = numbers(line);
        if (ids.length < 2) { entry.error = '「不能坐一起」至少要兩位學生'; return; }
        groups.push(ids);
        entry.group = ids;
        return;
      }
      const height = HEIGHT_WORDS.find(([re]) => re.test(line));
      if (height) {
        const ids = numbers(line);
        if (!ids.length) { entry.error = '找不到學生號碼'; return; }
        ids.forEach((id) => { heights[id] = height[1]; });
        entry.height = height[1];
        entry.students = ids;
        return;
      }
      entry.error = '看不懂這一行（需要「不能一起坐」、「坐第一列／最後一列／最左排／最右排」或「比較高／比較矮」）';
    });

    return { groups, zones, heights, lines };
  }

  function numbers(text) {
    const ids = (text.match(/\d+/g) || []).map(Number).filter((x) => x > 0);
    return [...new Set(ids)].sort((a, b) => a - b);
  }

  return { parseRules };
});
