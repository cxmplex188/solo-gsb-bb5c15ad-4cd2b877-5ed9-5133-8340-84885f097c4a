'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const QC = require('../lib/qc');

/* ---------- CSV 解析与行号定位 ---------- */

test('带表头解析，行号按物理行计算', () => {
  const { points, errors } = QC.parseMeasuredCsv('x_mm,y_mm\n5.1,4.9\n10,7.5\n');
  assert.equal(errors.length, 0);
  assert.deepEqual(points.map(p => [p.x, p.y, p.row]), [[5.1, 4.9, 2], [10, 7.5, 3]]);
});

test('无表头解析，行号从 1 开始；空行跳过', () => {
  const { points, errors } = QC.parseMeasuredCsv('5.1,4.9\n\n10,7.5\n');
  assert.equal(errors.length, 0);
  assert.deepEqual(points.map(p => p.row), [1, 3]);
});

test('容忍 BOM、空白与表头大小写', () => {
  const { points, errors } = QC.parseMeasuredCsv('﻿ X_MM , Y_MM \n 1 , 2 ');
  assert.equal(errors.length, 0);
  assert.deepEqual([points[0].x, points[0].y, points[0].row], [1, 2, 2]);
});

test('解析错误定位到具体行号与列号', () => {
  const { points, errors } = QC.parseMeasuredCsv('x_mm,y_mm\n5,5\nabc,3\n7\n8,8,8\n9,x');
  assert.equal(points.length, 1);
  assert.deepEqual(errors.map(e => e.line), [3, 4, 5, 6]);
  assert.match(errors[0].message, /第 3 行/);
  assert.match(errors[0].message, /第 1 列/);
  assert.match(errors[1].message, /列数为 1/);
  assert.match(errors[2].message, /列数为 3/);
});

/* ---------- 匹配规则 ---------- */

test('半径外的点不产生候选边', () => {
  const pairs = QC.solveMatching(2, 1, [{ i: 0, j: 0, d: 5 }, { i: 1, j: 0, d: 0.5 }]);
  assert.deepEqual(pairs, [{ i: 1, j: 0 }]);
});

test('一对一：实测点不得重复匹配，未配对设计点缺失', () => {
  const design = [{ x: 0, y: 0 }, { x: 0.4, y: 0 }];
  const r = QC.inspect({ design, csv: '0.1,0', tolerance: 0.5, maxRadius: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.stats.missingCount, 1);
  const usedRows = r.pairs.map(p => p.csvRow);
  assert.equal(new Set(usedRows).size, usedRows.length);
});

test('匹配对数最多优先于总距离最小', () => {
  // m1 离 d1 略远，但若 d1-m2、d2-m1 可得 2 对；贪心最近邻会只得 1 对
  const design = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  const csv = '0,0\n1,0.3\n0,0';
  const r = QC.inspect({ design, csv, tolerance: 1, maxRadius: 1 });
  assert.equal(r.stats.matchedCount, 2);
});

test('同为最大配对数时取总欧氏距离最小', () => {
  // d0=(0,0) d1=(10,0)；m0 近 d0，m1 近 d1；交换配对距离显著更大
  const design = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const r = QC.inspect({ design, csv: '0,1\n10,1', tolerance: 5, maxRadius: 12 });
  assert.deepEqual(r.pairs.map(p => [p.designIndex, p.csvRow]), [[1, 1], [2, 2]]);
  assert.ok(Math.abs(r.pairs[0].distance - 1) < 1e-9);
});

test('同成本按设计点序号与 CSV 行号稳定决胜', () => {
  const design = [{ x: 0, y: 0 }, { x: 2, y: 0 }];
  // 两个实测点完全重合于 (1,0)，两种配法成本相同
  const r1 = QC.inspect({ design, csv: '1,0\n1,0', tolerance: 5, maxRadius: 5 });
  assert.deepEqual(r1.pairs.map(p => [p.designIndex, p.csvRow]), [[1, 1], [2, 2]]);
  // 同一输入多次运行结果一致
  const r2 = QC.inspect({ design, csv: '1,0\n1,0', tolerance: 5, maxRadius: 5 });
  assert.deepEqual(r2.pairs, r1.pairs);
});

/* ---------- 判定与统计 ---------- */

test('偏移先应用再比较；合格/超差/缺失/多余四类齐全', () => {
  const design = [
    { x: 5, y: 5, r: 0.75 },
    { x: 11, y: 5, r: 0.75 },
    { x: 11, y: 7.5, r: 0.75 }
  ];
  // 实测整体偏 (-0.3, 0)：设置 offsetX=+0.3 后
  // 点1 残余 0.0（合格），点2 残余 0.6（超差），点3 无对应实测（缺失），(50,50) 多余
  const csv = '4.7,5\n10.1,5\n50,50';
  const r = QC.inspect({ design, csv, offsetX: 0.3, offsetY: 0, tolerance: 0.5, maxRadius: 2 });
  assert.equal(r.ok, true);
  const verdicts = r.pairs.map(p => p.verdict).sort();
  assert.deepEqual(verdicts, ['offset', 'pass']);
  assert.equal(r.stats.missingCount, 1);
  assert.equal(r.missing[0].designIndex, 3);
  assert.equal(r.stats.extraCount, 1);
  assert.equal(r.extra[0].csvRow, 3); // 无表头，物理行号
  assert.equal(r.stats.passCount, 1);
  // 通过率以设计点总数为分母：1/3
  assert.ok(Math.abs(r.stats.passRate - 1 / 3) < 1e-9);
  assert.equal(r.stats.maxDeviation, 0.6);
  assert.ok(Math.abs(r.stats.meanDeviation - 0.3) < 1e-9);
});

test('报告 CSV 含双方坐标、距离与中文结论', () => {
  const design = [{ x: 5, y: 5, r: 0.75 }];
  const r = QC.inspect({ design, csv: '5.2,4.9', tolerance: 0.5, maxRadius: 2 });
  assert.match(r.csv, /design_index,design_x_mm,design_y_mm,csv_row,measured_x_mm,measured_y_mm,corrected_x_mm,corrected_y_mm,distance_mm,conclusion/);
  assert.match(r.csv, /1,5,5,1,5.2,4.9,5.2,4.9,0\.2236,合格/);
  assert.match(r.csv, /pass_rate_percent/);
});

test('叠加 SVG 以四类颜色区分', () => {
  const design = [{ x: 5, y: 5, r: 0.75 }, { x: 11, y: 5, r: 0.75 }];
  const r = QC.inspect({
    design, csv: '5.2,4.9\n40,40',
    tolerance: 0.1, maxRadius: 2,
    plateWidth: 100, plateHeight: 50
  });
  assert.match(r.svg, /#16a34a|#d97706/); // 合格或超差
  assert.match(r.svg, /#dc2626/);         // 缺失
  assert.match(r.svg, /#7c3aed/);         // 多余
  assert.match(r.svg, /data-verdict="offset"/);
});

test('参数非法或 CSV 出错时 ok=false 且不给结论', () => {
  const design = [{ x: 5, y: 5 }];
  assert.equal(QC.inspect({ design, csv: '5,5', tolerance: 0, maxRadius: 2 }).ok, false);
  assert.equal(QC.inspect({ design, csv: '5,5', tolerance: 0.5, maxRadius: 0 }).ok, false);
  const r = QC.inspect({ design, csv: 'x,y\n5', tolerance: 0.5, maxRadius: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.svg, null);
  assert.ok(r.errors.some(e => e.line === 2));
});

test('无设计点也无实测点时通过率 100%', () => {
  const r = QC.inspect({ design: [], csv: '', tolerance: 0.5, maxRadius: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.stats.passRate, 1);
  assert.equal(r.stats.maxDeviation, null);
  assert.equal(r.stats.meanDeviation, null);
});
