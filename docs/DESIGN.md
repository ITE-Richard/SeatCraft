# SeatCraft 座位小幫手：設計與模組介面

國中老師用的離線排座位網頁。雙擊 `index.html` 即可使用，不需安裝、不需網路。

教室形狀由老師在介面上設定：輸入**列數（前到後）**與**排數（左到右）**，再點格子標記 **X**（不坐學生）。
預設為 7 列 × 7 排並標好 6 個 X（與 `教室內座位.md` 相同的形狀，只是預設值，程式不讀那個檔案）。

## 需求（Richard 已確認）

1. 學生 n 位，老師輸入（可附姓名）。學生以 1..n 的號碼識別；`Seat 01`…`Seat 43` 只是座位編號，與學生號碼無關。
2. **不相鄰群組**：一群（N≥2）學生中任兩人不得相鄰。「兩個愛嬉鬧的學生不能坐一起」就是 N=2 的群組。
3. **相鄰** = 周圍 8 格（含斜對角），即 `max(|Δ列|, |Δ排|) == 1`。
4. **位置限制**：每位學生至多一個區域（互斥，不會同時要求兩區）：
   - `front` 第一列：layout 最前面那一列的座位（預設 01–07）
   - `back` 最後一列：layout 最後面那一列的座位（預設**只有 42、43**）
   - `left` 最左排：layout 最左邊那一排的座位（預設 01、08、15、22、29）
   - `right` 最右排：layout 最右邊那一排的座位（預設 07、14、21、28、35、41、43）
   - 左右以**學生面向講桌**為準，即 `教室內座位.md` 圖上的左右。
   - 區域依 layout 幾何決定，**不因老師停用座位或空位而移動**；被停用的座位只是從區域中移除。
5. **身高（軟條件，盡量做到）**：老師只有模糊印象，分三級：偏高／普通（預設）／偏矮。
   「不能坐在一起」與「指定位置」一律優先。依序考慮：
   1. 偏高的坐**後半部**（有座位的列數取一半，中間那列算後半部；7 列 → 第 4～7 列）；
   2. 偏高的盡量不要坐在偏矮的**前面**（同一直排，正後方 1～2 個座位）；
   3. 空位留在後面；
   4. 偏高擋普通、普通擋偏矮；偏高越後、偏矮越前。
6. 人數少於座位數時，空位盡量留在後面（軟目標，優先順序見上）。

用詞：介面一律照老師的用法——「**列**」是橫的（前後），「**排**」是直的（左右）。

## 技術約定

- 純 HTML/CSS/JS，**傳統 `<script src>`**（不用 ES modules，因為 `file://` 下會被 CORS 擋），零依賴、免建置。
- 每個 `src/*.js` 用相同的 UMD 外殼，瀏覽器掛在 `window.SeatCraft.<模組名>`，Node 用 `require`：

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./classroom.js'));          // 依需要 require
  } else {
    root.SeatCraft = root.SeatCraft || {};
    root.SeatCraft.solver = factory(root.SeatCraft.classroom);
  }
})(typeof self !== 'undefined' ? self : this, function (classroom) {
  'use strict';
  // ...
  return { /* public API */ };
});
```

- `index.html` 載入順序：`classroom.js` → `validator.js` → `solver.js` → `rules.js` → `ui.js`。
- 測試：`tests/*.test.js`，Node 內建 `node:test` + `node:assert/strict`，執行 `node --test`。
- 所有給老師看的訊息用繁體中文、白話。

## 資料結構

座標一律 **0-based**（`row` 0 = 最靠講桌；`col` 0 = 最左），顯示時才 +1。

```js
// Layout：教室形狀（可存檔）
Layout = { rows: 7, cols: 7, cells: (string|null)[][] }   // cells[row][col] = 座位標籤 '01' 或 null（不存在）

// Classroom：buildClassroom(layout, disabledLabels) 的結果
Classroom = {
  rows, cols,
  seats: Seat[],              // 只含可坐座位，依 (row, col) 排序
  grid: (number|null)[][],    // grid[row][col] = seat index 或 null
  zones: { front: number[], back: number[], left: number[], right: number[] },  // seat index，已排序
  adjacency: number[][],      // adjacency[i] = 與座位 i 相鄰（8 格）的 seat index，已排序
}
Seat = { index, label, row, col }

// Problem：一次排座位的輸入
Problem = {
  classroom: Classroom,
  students: [{ id: 1, name: '王小明' }, ...],   // id 為 1..n 的整數，name 可為 ''
  zones:  { [studentId]: 'front'|'back'|'left'|'right' },   // 沒有限制的學生不列
  groups: [[1, 5], [3, 7, 9]],                              // 每組 ≥2 人，組內兩兩不相鄰
}

// Assignment：排座結果
Assignment = { [studentId]: seatIndex }

// Issue：靜態檢查或違規
Issue = {
  kind: 'input' | 'infeasible' | 'violation',
  code: string,            // 例：'TOO_MANY_STUDENTS'、'ZONE_OVER_CAPACITY'、'ADJACENT_IN_GROUP'
  message: string,         // 給老師看的中文
  students: number[],      // 相關學生 id
  seats: number[],         // 相關 seat index
}
```

## 模組介面

### `src/classroom.js`（Claude）
- `DEFAULT_GRID = { rows, cols, blocked: ['row,col', …] }`：介面的預設教室。
- `makeLayout(grid)` → `Layout`：X 格子為 `null`，其餘依由前到後、由左到右編號 `01`、`02`…（超過 99 席補成三位數）。
  區域取「有座位的」最前列、最後列、最左排、最右排，所以整列都標 X 時，區域會落到下一列。
- `DEFAULT_LAYOUT`：等於 `makeLayout(DEFAULT_GRID)`，供測試使用。
- `buildClassroom(layout, disabledLabels = [])` → `Classroom`
- `isAdjacent(classroom, a, b)` → boolean
- `ZONES = ['front','back','left','right']`、`ZONE_NAMES = { front: '第一列', back: '最後一列', left: '最左排', right: '最右排' }`

### `src/validator.js`（Antigravity）
- `staticCheck(problem)` → `Issue[]`（kind 為 `input` 或 `infeasible`；空陣列 = 沒發現問題，**不代表一定有解**）
  - `input`：n<1、學生 id 重複或非整數、群組引用不存在的學生、群組少於 2 人、zone 值不合法、zone 指向不存在的學生。
  - `infeasible`（必須是**有證明的**矛盾，不可用貪婪結果當上界）：學生數 > 座位數；某區域可坐座位為 0 但有人指定；指定某區的人數 > 該區座位數；某群組人數 > 該群組可用座位的最大不相鄰座位數（可精確計算；43 席規模可用位元遮罩回溯）；同時考慮區域時，同區同群組的人數 > 該區最大不相鄰座位數。
- `checkAssignment(problem, assignment)` → `Issue[]`（kind 為 `violation`）：學生未入座、座位不存在、兩人同座、區域違規、群組相鄰。UI 用它在手動調整後標紅框。

### `src/solver.js`（Codex）
- `solve(problem, options)` → `{ status, assignment, nodes }`
  - `options = { seed = 1, maxNodes = 200000 }`
  - `status`：`'FEASIBLE'`（`assignment` 滿足所有硬限制）、`'INFEASIBLE'`（窮舉證明無解，`assignment = null`）、`'UNKNOWN'`（節點額度用完，`assignment = null`）。
  - 同一輸入 + 同 `seed` + 同 `maxNodes` → 相同結果；不同 seed 應產生不同排法（「再排一次」用）。
  - 演算法：MRV + 前向檢查 + seeded 隨機。軟目標：空位盡量在後面（硬限制優先）。
  - `solve` 不呼叫 `staticCheck`；UI 先跑 `staticCheck`，沒有 `input`／`infeasible` 才呼叫 `solve`。
- 不得依賴 `validator.js`（兩者平行開發）；測試可自行寫小驗證函式。

### `src/height.js`（Claude）
- `Problem.heights = { [studentId]: 'tall' | 'short' }`（沒列的是普通）。
- `score(problem, assignment)` → `{ notBack, blocks, empties, minor, tilt, pairs, front }`，依序字典序比較，越小越好；
  `front` 列出沒坐後半部的偏高學生，`pairs` 列出偏高擋偏矮的配對（UI 報告用）。
- `improve(problem, assignment, { seed, maxPasses })`：從 solver 的合法解出發做爬山法（兩人互換／移到空位），
  只接受不違反硬條件且分數變好的調整；同 seed 結果相同。
- solver 不變；UI 在 `solve` 得到 `FEASIBLE` 後呼叫 `improve`。

### `src/rules.js`（Claude）
- `parseRules(text, { layout })` → `{ groups, zones, lines }`：把老師貼上的條件文字逐行解析。
  - 含「不能／不要／分開／愛講話…」且有 ≥2 個號碼 → 群組。
  - 含「第一列／最後一列／第N列（N=最後一列）／最左排／最右排／第1排／第N排」→ 位置限制；「第七列」對應最後一列。
  - 含「高」或「矮」（例：「3, 7, 12 比較高」）→ 身高印象。
  - 行首項目編號（`8.`、`(3)`）會先去掉；看不懂的行在 `lines[i].error` 說明原因。

### `index.html`、`src/ui.js`、`src/style.css`（Claude）
- 學生：人數、貼姓名。
- 條件：點選學生號碼（多選）→「不能坐在一起」或「指定坐：第一列／最後一列／最左排／最右排／不限」；或貼上文字條件由 `rules.js` 解析並逐行回報。目前條件列表可逐項刪除。
- 教室：列數、排數輸入；勾選「編輯教室」後點格子標記／取消 X。座位表以格子位置 `'row,col'` 儲存，標 X 後編號改變也不會錯位、排座位／再排一次（`UNKNOWN` 時自動換 seed 重試）、點兩個座位互換或移到空位、違規紅框與文字、列印、匯出 CSV／Markdown、設定存成／載入 JSON（localStorage 自動暫存）。
