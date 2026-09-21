# 盲文标签排版台（Braille Label Studio）

输入英文标签文字与板材宽/高、点距、行距，系统按**六点一级盲文**转换并排版；另提供**压印质检**模式，将实测凸点 CSV 与最近一次成功排版的设计点逐一比对：

- 大写字母前自动添加大写前缀 `⠠`（点 6）
- 连续数字段只在段首添加一个数字前缀 `⠼`（点 3-4-5-6）
- 依据转换后的盲文单元**整词换行**，词间空一个空白单元
- 任何单词放不下、或总行数超出板材容量时，**明确指出原因，绝不裁切**
- 页面实时预览带毫米（mm）坐标的凸点 SVG，并可下载 **SVG** 与**排版 JSON**
- **压印质检**：粘贴实测凸点 CSV、设置校准偏移/合格公差/关联半径，叠加 SVG 区分四类结果并下载质检报告 CSV
- **自动校准**：设置 X/Y 最大校准量后一键估算全局平移（逐候选一对一匹配，非质心差），写回偏移输入框并自动重跑质检

## 一条命令启动（Docker Compose）

```bash
docker compose up --build
```

Compose 会在构建镜像时自动完成依赖安装与初始化。启动后在浏览器访问：

**http://localhost:3000** （容器内外端口均为 `3000`）

页面顶部两个页签即为入口：

- **排版模式**（`http://localhost:3000/`，默认页签）：盲文转换、整词换行排版与 SVG/JSON 下载；
- **压印质检**：同一页面点击顶部「**压印质检**」页签进入，以当前会话中最近一次成功排版的设计点为基准。

停止：`docker compose down`

## 本地开发（不用 Docker）

```bash
npm install
npm start          # 同样监听 http://localhost:3000
npm test           # 运行转换/排版/质检单元测试（node:test）
```

## 使用说明（排版模式）

| 参数 | 含义 | 默认值 |
| --- | --- | --- |
| 标签文字 | 英文标签（A–Z、a–z、0–9 及常用标点，≤500 字符） | `EXIT Door 2` |
| 板材宽度 / 高度 | 标签板材幅面，单位 mm | 100 × 50 |
| 点距 | 单元内相邻凸点中心距，单位 mm | 2.5（标准盲文） |
| 行距 | 相邻两行顶行点的中心距，单位 mm | 10（标准盲文） |
| 边距（高级） | 板材四周边距，单位 mm | 5 |
| 字距（高级） | 相邻单元净间距，留空 = 1.4×点距（标准 → 6mm 单元pitch） | 自动 |
| 凸点直径（高级） | 留空 = 0.6×点距（标准 ≈1.5mm） | 自动 |

放不下时的报错示例：

- `单词 “EXIT” 转换后占 6 个盲文单元（含大写/数字前缀），超过每行最多 4 个单元……`
- `整词换行后共需 5 行，板材有效高度仅容纳 4 行……`

## 压印质检模式

进入「压印质检」页签前请先在「排版模式」完成一次成功排版（左侧绿色基准条会显示基准标签文字、设计点数与排版时间；排版失败不会覆盖基准）。

| 输入 | 含义 |
| --- | --- |
| 实测凸点 CSV | 每行一个点，两列 `x_mm,y_mm`（mm）；首行可为 `x_mm,y_mm` 表头（可省略），允许空行；点序任意（无需与设计点对应） |
| X / Y 校准偏移 | 对实测坐标先整体平移：比较坐标 = 实测坐标 + (offsetX, offsetY) |
| 合格公差 | 配对欧氏距离 ≤ 公差判为「合格」，否则为「偏移超差」 |
| 最大关联半径 | 只有设计点与偏移后实测点距离 ≤ 半径时才允许配对 |
| X / Y 最大校准量 | 自动校准允许的最大平移幅度（mm），两轴分别限制 |

比较算法：在关联半径构成的二分图上做**一对一最优匹配**，优先级依次为 ① 匹配对数最多 → ② 总欧氏距离最小 → ③ 再相同则按设计点序号与 CSV 行号稳定决胜（每个实测点最多匹配一个设计点，绝不重复配对）。未配对的设计点记为**缺失**，未配对的实测点记为**多余**。

### 自动校准（估算全局平移）

实测点整体偏移未知时，不必手调偏移：设置 **X/Y 最大校准量** 后点击「**估算全局平移并写回偏移**」：

1. 以「设计坐标 − 实测坐标」生成候选平移，**仅保留两轴均未超限**（|dx| ≤ X 最大校准量 且 |dy| ≤ Y 最大校准量）者，相同候选去重；
2. 每个候选复用上述一对一最优匹配，依次按 **① 匹配对数最多 → ② 总残差最小 → ③ |dx|+|dy| 最小 → ④ dx、dy 数值升序** 确定唯一结果；
3. 缺失点与多余点由匹配过程自然处理（不要求全部配对），**不以质心差等整体统计量替代**；
4. 估算值自动写回 X/Y 校准偏移输入框，并**立即重跑四类判定**；无可用候选（全部超限、CSV 为空等）时**保留原偏移值**并明确提示原因。

- CSV 解析错误会逐条定位到**具体物理行号（和列号）**，例如 `第 3 行：列数为 1，应为 2 列（x_mm,y_mm）`
- 叠加 SVG 用四类颜色区分：🟩 合格（绿）/ 🟧 偏移超差（橙）/ 🟥 缺失（红）/ 🟣 多余（紫）；○ 为设计点、◆ 为应用偏移后的实测点，细线连接配对
- 指标：**通过率**（合格对数 / 设计点总数）、**最大偏差**、**平均偏差**（均只统计配对点），以及配对/缺失/多余计数
- **下载质检报告 CSV**：含设计点序号与设计坐标、CSV 行号与实测坐标、偏移后坐标、配对距离、中文结论（合格/偏移超差/缺失/多余），并附汇总与参数行（UTF-8 BOM，Excel 可直接打开）；另可下载叠加 SVG

## API

### `POST /api/layout`

```json
{ "text": "EXIT Door 2", "plateWidth": 100, "plateHeight": 50, "dotSpacing": 2.5, "lineSpacing": 10, "margin": 5 }
```

返回 `{ ok, errors, params, cellsPerLine, maxLines, lines, dots, brailleText, stats, svg }`：

- `ok=false` 时 `errors` 列出放不下的具体原因，`svg/dots` 为空（不输出裁切结果）
- `dots[].x/y/r` 为每个凸点的毫米坐标，`svg` 为完整 SVG 文档（`width/height` 以 mm 标注）

### `POST /api/qc`

```json
{
  "design": [{ "x": 5, "y": 5, "r": 0.75 }],
  "csv": "x_mm,y_mm\n5.2,4.9",
  "offsetX": 0, "offsetY": 0,
  "tolerance": 0.5, "maxRadius": 2,
  "plateWidth": 100, "plateHeight": 50
}
```

返回 `{ ok, errors, params, baseline, measuredCount, pairs, missing, extra, stats, svg, csv }`：

- `ok=false` 时 `errors[]` 含参数错误与逐行（`line` 列）CSV 解析错误，`svg/csv` 为空
- `pairs[]` 含双方坐标、偏移后坐标、距离与 `verdict`（`pass` / `offset`）；`missing[]`、`extra[]` 为未配项
- `stats` 含 `passRatePercent`、`maxDeviation`、`meanDeviation` 等；`csv` 为可直接下载的报告文本

### `POST /api/qc/calibrate`

```json
{
  "design": [{ "x": 5, "y": 5, "r": 0.75 }],
  "csv": "x_mm,y_mm\n6.2,4.1",
  "maxCalibrateX": 5, "maxCalibrateY": 5,
  "maxRadius": 2
}
```

返回 `{ ok, errors, offset, matchedCount, totalResidual, candidateCount, evaluatedCount, params }`：

- `ok=true` 时 `offset = { dx, dy }` 为估算出的全局平移（写回校准偏移后重跑 `/api/qc` 即可）；`matchedCount`/`totalResidual` 为该偏移下的匹配对数与总残差
- `ok=false`（无可用候选、参数或 CSV 错误）时 `offset` 为 `null`，调用方应保留原偏移值

健康检查：`GET /api/health`

## 项目结构

```
├── server.js            # Express 服务：静态页面 + /api/layout + /api/qc + /api/qc/calibrate
├── lib/braille.js       # 核心：一级盲文转换、整词换行排版、毫米坐标 SVG 生成
├── lib/qc.js            # 核心：实测 CSV 解析（行号定位）、一对一最优匹配、判定/SVG/CSV 报告、自动校准
├── public/              # 原生前端（index.html / app.js / style.css）
├── test/                # node:test 单元测试（排版 + 质检 + 自动校准）
├── Dockerfile           # 单阶段构建，npm install + 启动
└── docker-compose.yml   # 一条命令编排启动
```
