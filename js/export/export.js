// 내보내기 — 남에게 건네줄 문서. 가독성 최우선.
// 엑셀: 서식 있는 .xlsx (ExcelJS, js/vendor/exceljs.min.js 를 필요할 때만 불러옴)
// 이미지: A4 세로 리포트 (Canvas). 색/레이아웃은 참고 디자인과 동일 팔레트.
import * as store from './../store.js';
import { won, formatMonth, monthKey, addMonths, compareMonth, todayISO, toast } from '../util.js';
import { STATUS } from '../ui/shell.js';

/* ================= 팔레트 ================= */
const C = {
  navy: '18364D', teal: '11877A', ink: '26343C', gray: '7A858A',
  beige: 'F5F0E7', zebra: 'EDF5F3', mint: 'DCEFEA', line: 'D7DEDE', white: 'FFFFFF',
  ok: '11877A', bad: 'C0392B', warn: 'B8860B', idle: '7A858A',
};
const hx = (h) => '#' + h;
const argb = (h) => 'FF' + h;
const stColor = (s) => ({ ok: C.ok, part: C.warn, bad: C.bad, idle: C.idle }[s] || C.idle);

/* ================= 공통 ================= */
function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ExcelJS 를 필요할 때만 로드(전역 UMD)
let _ejsPromise = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_ejsPromise) return _ejsPromise;
  _ejsPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/exceljs.min.js';
    s.onload = () => res(window.ExcelJS);
    s.onerror = () => rej(new Error('엑셀 기능을 불러오지 못했어요.'));
    document.head.appendChild(s);
  });
  return _ejsPromise;
}

/* ================= 데이터 준비 ================= */
// 세입자 1명: 계약 시작월 ~ (현재 또는 퇴거월) 월별 입금내역
async function tenantReport(t) {
  const start = t.rentHistory?.[0]?.from || t.contractStart;
  const end = (t.status === 'movedout' && t.movedOutAt) ? monthKey(new Date(t.movedOutAt)) : monthKey();
  const pays = await store.getAllPaymentsForTenant(t.id);
  const byMonth = {};
  pays.forEach((p) => (byMonth[p.month] || (byMonth[p.month] = [])).push(p));

  const groups = [];
  let m = start, total = 0, empty = 0, months = 0, guard = 0;
  while (compareMonth(m, end) <= 0 && guard++ < 600) {
    months++;
    const ps = byMonth[m] || [];
    if (ps.length === 0) {
      empty++;
      groups.push({ month: m, empty: true, rows: [{ date: '', payer: '입금 없음', amount: null }] });
    } else {
      total += ps.reduce((s, p) => s + p.amount, 0);
      groups.push({ month: m, empty: false, rows: ps.map((p) => ({ date: p.paidAt, payer: p.depositorName || '-', amount: p.amount })) });
    }
    m = addMonths(m, 1);
  }
  const dates = pays.map((p) => p.paidAt).filter(Boolean).sort();
  return {
    title: `${t.name}${t.businessName ? '(' + t.businessName + ')' : ''} — 실제 입금내역`,
    groups, total, empty, months,
    periodStart: dates[0] || (start + '-01'),
    periodEnd: dates[dates.length - 1] || todayISO(),
  };
}

/* ================= 이미지(A4 세로) ================= */
function makeCanvas(w, h) {
  const dpr = 2;
  const cv = document.createElement('canvas');
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'middle';
  return { cv, ctx, w, h };
}
const FONT = (spec) => `${spec} "Malgun Gothic", "Noto Sans KR", sans-serif`;
function fitText(ctx, text, maxW) {
  text = String(text ?? '');
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
function cell(ctx, text, x, y, w, h, { align = 'left', color = C.ink, font = FONT('600 23px'), pad = 18 } = {}) {
  ctx.font = font; ctx.fillStyle = hx(color);
  const t = fitText(ctx, text, w - pad * 2);
  ctx.textAlign = align;
  const tx = align === 'right' ? x + w - pad : align === 'center' ? x + w / 2 : x + pad;
  ctx.fillText(t, tx, y + h / 2 + 1);
  ctx.textAlign = 'left';
}
function saveCanvas(cv, filename) {
  cv.toBlob((b) => { download(filename, b); toast('이미지를 내려받았어요', 'ok'); }, 'image/png');
}

const TCOLS = [
  { label: '월', w: 16, align: 'center' },
  { label: '거래일', w: 20, align: 'center' },
  { label: '실제 입금자', w: 40, align: 'left' },
  { label: '개별 입금액', w: 24, align: 'right' },
];

export async function exportTenantImage(t) {
  const rep = await tenantReport(t);
  const W = 1240, mx = 70, CW = W - mx * 2;
  const rowH = 58, headerH = 64, titleH = 118, sumH = 150, subH = 56, footH = 66, top = 64;
  const totalRows = rep.groups.reduce((s, g) => s + g.rows.length, 0);
  const H = top + titleH + sumH + subH + headerH + totalRows * rowH + footH + 70;
  const { cv, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

  const xs = []; let cx = mx; TCOLS.forEach((c) => { xs.push(cx); cx += CW * c.w / 100; });
  const colX = (i) => xs[i], colW = (i) => CW * TCOLS[i].w / 100;

  let y = top;
  // 제목바
  ctx.fillStyle = hx(C.navy); ctx.fillRect(mx, y, CW, titleH);
  cell(ctx, rep.title, mx, y, CW, titleH, { align: 'center', color: C.white, font: FONT('800 40px') });
  y += titleH;
  // 요약 밴드
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, sumH);
  const stats = [['전체 확인기간', rep.months + '개월'], ['빈 달', rep.empty + '개월'], ['전체 실제 총입금', won(rep.total) + '원']];
  const bw = CW / 3;
  stats.forEach((s, i) => {
    cell(ctx, s[0], mx + bw * i, y + 10, bw, 44, { align: 'center', color: C.ink, font: FONT('700 24px') });
    cell(ctx, s[1], mx + bw * i, y + 66, bw, 60, { align: 'center', color: C.teal, font: FONT('800 38px') });
  });
  y += sumH;
  // 확인기간
  ctx.fillStyle = hx(C.mint); ctx.fillRect(mx, y, CW, subH);
  cell(ctx, `확인기간 ${rep.periodStart} → ${rep.periodEnd}`, mx, y, CW, subH, { align: 'center', color: C.teal, font: FONT('700 25px') });
  y += subH;
  // 헤더
  ctx.fillStyle = hx(C.teal); ctx.fillRect(mx, y, CW, headerH);
  TCOLS.forEach((c, i) => cell(ctx, c.label, colX(i), y, colW(i), headerH, { align: c.align === 'right' ? 'right' : 'center', color: C.white, font: FONT('700 25px') }));
  const tableTop = y; y += headerH;
  // 행(월 그룹)
  let gi = 0;
  for (const g of rep.groups) {
    const gTop = y, gH = g.rows.length * rowH;
    ctx.fillStyle = hx(gi % 2 === 0 ? C.white : C.zebra); ctx.fillRect(mx, gTop, CW, gH);
    // 월 (그룹 병합, 세로 중앙)
    cell(ctx, formatMonth(g.month).replace('년 ', '.').replace('월', ''), colX(0), gTop, colW(0), gH, { align: 'center', color: C.ink, font: FONT('700 24px') });
    g.rows.forEach((r, ri) => {
      const ry = gTop + ri * rowH;
      if (r.amount == null) {
        cell(ctx, '입금 없음', colX(1), ry, colW(1) + colW(2), rowH, { align: 'center', color: C.gray, font: FONT('600 23px') });
        cell(ctx, '-', colX(3), ry, colW(3), rowH, { align: 'right', color: C.gray, font: FONT('600 23px') });
      } else {
        cell(ctx, r.date, colX(1), ry, colW(1), rowH, { align: 'center', color: C.ink });
        cell(ctx, r.payer, colX(2), ry, colW(2), rowH, { align: 'left', color: C.ink });
        cell(ctx, won(r.amount) + '원', colX(3), ry, colW(3), rowH, { align: 'right', color: C.ink, font: FONT('700 24px') });
      }
    });
    ctx.strokeStyle = hx(C.line); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, gTop + gH + 0.5); ctx.lineTo(mx + CW, gTop + gH + 0.5); ctx.stroke();
    y += gH; gi++;
  }
  // 열 구분선(세로, 은은하게)
  ctx.strokeStyle = hx(C.line); ctx.lineWidth = 1;
  for (let i = 1; i < TCOLS.length; i++) { ctx.beginPath(); ctx.moveTo(colX(i) + 0.5, tableTop); ctx.lineTo(colX(i) + 0.5, y); ctx.stroke(); }
  // 바깥 테두리
  ctx.strokeStyle = hx(C.line); ctx.strokeRect(mx + 0.5, tableTop + 0.5, CW, y - tableTop);
  // 합계
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, footH);
  cell(ctx, `합계 · 빈 달 ${rep.empty}개월`, mx, y, CW / 2, footH, { align: 'left', color: C.ink, font: FONT('800 26px') });
  cell(ctx, won(rep.total) + '원', colX(3), y, colW(3), footH, { align: 'right', color: C.ink, font: FONT('800 26px') });
  ctx.strokeStyle = hx(C.teal); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, y + 0.5); ctx.lineTo(mx + CW, y + 0.5); ctx.stroke();

  saveCanvas(cv, `입금내역_${t.unit}호_${t.name}.png`);
}

/* ================= 엑셀(.xlsx, 서식 있음) ================= */
function styleCell(cell, { fill, font, align, numFmt, border = true } = {}) {
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fill) } };
  if (font) cell.font = Object.assign({ name: '맑은 고딕' }, font);
  cell.alignment = Object.assign({ vertical: 'middle', wrapText: false }, align);
  if (numFmt) cell.numFmt = numFmt;
  if (border) {
    const b = { style: 'thin', color: { argb: argb(C.line) } };
    cell.border = { top: b, left: b, right: b, bottom: b };
  }
}

export async function exportTenantExcel(t) {
  let EJS;
  try { EJS = await loadExcelJS(); } catch (e) { return toast(e.message, 'bad'); }
  const rep = await tenantReport(t);
  const wb = new EJS.Workbook();
  const ws = wb.addWorksheet('입금내역', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  ws.columns = [{ width: 13 }, { width: 16 }, { width: 30 }, { width: 18 }];
  const FMT = '#,##0"원"';

  // 1 제목
  ws.mergeCells('A1:D1'); ws.getRow(1).height = 42;
  styleCell(ws.getCell('A1'), { fill: C.navy, font: { size: 18, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: 'center' } });
  ws.getCell('A1').value = rep.title;
  // 2 요약 라벨
  ws.mergeCells('A2:B2'); ws.getRow(2).height = 22;
  ['A2', 'C2', 'D2'].forEach((a, i) => { styleCell(ws.getCell(a), { fill: C.beige, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); ws.getCell(a).value = ['전체 확인기간', '빈 달', '전체 실제 총입금'][i]; });
  // 3 요약 값
  ws.mergeCells('A3:B3'); ws.getRow(3).height = 30;
  const vals = [rep.months + '개월', rep.empty + '개월', won(rep.total) + '원'];
  ['A3', 'C3', 'D3'].forEach((a, i) => { styleCell(ws.getCell(a), { fill: C.beige, font: { size: 15, bold: true, color: { argb: argb(C.teal) } }, align: { horizontal: 'center' } }); ws.getCell(a).value = vals[i]; });
  // 4 확인기간
  ws.mergeCells('A4:D4'); ws.getRow(4).height = 22;
  styleCell(ws.getCell('A4'), { fill: C.mint, font: { size: 11, bold: true, color: { argb: argb(C.teal) } }, align: { horizontal: 'center' } });
  ws.getCell('A4').value = `확인기간 ${rep.periodStart} → ${rep.periodEnd}`;
  // 5 헤더
  ws.getRow(5).height = 24;
  ['월', '거래일', '실제 입금자', '개별 입금액'].forEach((h, i) => {
    const c = ws.getRow(5).getCell(i + 1);
    styleCell(c, { fill: C.teal, font: { size: 11, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: i === 2 ? 'left' : i === 3 ? 'right' : 'center' } });
    c.value = h;
  });

  // 데이터
  let r = 6, gi = 0;
  for (const g of rep.groups) {
    const first = r, zebra = gi % 2 === 0 ? C.white : C.zebra;
    g.rows.forEach((row) => {
      const R = ws.getRow(r); R.height = 20;
      styleCell(R.getCell(1), { fill: zebra, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } });
      if (row.amount == null) {
        styleCell(R.getCell(2), { fill: zebra });
        styleCell(R.getCell(3), { fill: zebra, font: { size: 11, color: { argb: argb(C.gray) } }, align: { horizontal: 'center' } });
        R.getCell(3).value = '입금 없음';
        styleCell(R.getCell(4), { fill: zebra, font: { size: 11, color: { argb: argb(C.gray) } }, align: { horizontal: 'right' } });
        R.getCell(4).value = '-';
      } else {
        styleCell(R.getCell(2), { fill: zebra, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } });
        R.getCell(2).value = row.date;
        styleCell(R.getCell(3), { fill: zebra, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } });
        R.getCell(3).value = row.payer;
        styleCell(R.getCell(4), { fill: zebra, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT });
        R.getCell(4).value = row.amount;
      }
      r++;
    });
    ws.getCell(first, 1).value = formatMonth(g.month).replace('년 ', '.').replace('월', '');
    if (r - 1 > first) ws.mergeCells(first, 1, r - 1, 1);
    gi++;
  }
  // 합계
  const R = ws.getRow(r); R.height = 26;
  ws.mergeCells(r, 1, r, 3);
  styleCell(R.getCell(1), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } });
  R.getCell(1).value = `합계 · 빈 달 ${rep.empty}개월`;
  styleCell(R.getCell(4), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT });
  R.getCell(4).value = rep.total;

  const buf = await wb.xlsx.writeBuffer();
  download(`입금내역_${t.unit}호_${t.name}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  toast('엑셀 파일을 내려받았어요', 'ok');
}

/* ================= 건물 전체(이번 달) ================= */
async function buildingRows(buildingId, month) {
  const building = await store.getBuilding(buildingId);
  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');
  const rows = []; let due = 0, paid = 0, ok = 0, bad = 0;
  for (const t of tenants) {
    const ps = await store.getPaymentsForTenantMonth(t.id, month);
    const s = store.paymentStatus(t, month, ps);
    due += s.due; paid += s.paid;
    if (s.state === 'ok') ok++; else if (s.state === 'bad') bad++;
    rows.push({ unit: t.unit, name: t.name, due: s.due, paid: s.paid, state: s.state });
  }
  return { building, rows, due, paid, ok, bad, count: tenants.length };
}

export async function exportBuildingImage(buildingId, month = monthKey()) {
  const rep = await buildingRows(buildingId, month);
  const W = 1240, mx = 70, CW = W - mx * 2;
  const rowH = 58, headerH = 64, titleH = 118, sumH = 150, footH = 66, top = 64;
  const H = top + titleH + sumH + headerH + rep.rows.length * rowH + footH + 70;
  const { cv, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

  const cols = [
    { label: '호실', w: 14, align: 'center' }, { label: '이름', w: 26, align: 'left' },
    { label: '청구', w: 22, align: 'right' }, { label: '받음', w: 22, align: 'right' }, { label: '상태', w: 16, align: 'center' },
  ];
  const xs = []; let cx = mx; cols.forEach((c) => { xs.push(cx); cx += CW * c.w / 100; });
  const colX = (i) => xs[i], colW = (i) => CW * cols[i].w / 100;

  let y = top;
  ctx.fillStyle = hx(C.navy); ctx.fillRect(mx, y, CW, titleH);
  cell(ctx, `${rep.building?.name || '건물'} — ${formatMonth(month)} 납부 현황`, mx, y, CW, titleH, { align: 'center', color: C.white, font: FONT('800 38px') });
  y += titleH;
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, sumH);
  const stats = [['전체', rep.count + '명'], ['완납', rep.ok + '명'], ['미납', rep.bad + '명']];
  const bw = CW / 3;
  stats.forEach((s, i) => {
    cell(ctx, s[0], mx + bw * i, y + 10, bw, 44, { align: 'center', color: C.ink, font: FONT('700 24px') });
    cell(ctx, s[1], mx + bw * i, y + 66, bw, 60, { align: 'center', color: i === 2 ? C.bad : C.teal, font: FONT('800 38px') });
  });
  y += sumH;
  ctx.fillStyle = hx(C.teal); ctx.fillRect(mx, y, CW, headerH);
  cols.forEach((c, i) => cell(ctx, c.label, colX(i), y, colW(i), headerH, { align: c.align === 'right' ? 'right' : 'center', color: C.white, font: FONT('700 25px') }));
  const tableTop = y; y += headerH;
  rep.rows.forEach((row, i) => {
    ctx.fillStyle = hx(i % 2 === 0 ? C.white : C.zebra); ctx.fillRect(mx, y, CW, rowH);
    cell(ctx, row.unit, colX(0), y, colW(0), rowH, { align: 'center', color: C.ink, font: FONT('700 24px') });
    cell(ctx, row.name, colX(1), y, colW(1), rowH, { align: 'left', color: C.ink });
    cell(ctx, won(row.due) + '원', colX(2), y, colW(2), rowH, { align: 'right', color: C.ink });
    cell(ctx, won(row.paid) + '원', colX(3), y, colW(3), rowH, { align: 'right', color: C.ink });
    cell(ctx, STATUS[row.state].label, colX(4), y, colW(4), rowH, { align: 'center', color: stColor(row.state), font: FONT('700 23px') });
    y += rowH;
  });
  ctx.strokeStyle = hx(C.line); ctx.lineWidth = 1;
  for (let i = 1; i < cols.length; i++) { ctx.beginPath(); ctx.moveTo(colX(i) + 0.5, tableTop); ctx.lineTo(colX(i) + 0.5, y); ctx.stroke(); }
  ctx.strokeRect(mx + 0.5, tableTop + 0.5, CW, y - tableTop);
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, footH);
  cell(ctx, '합계', mx, y, colW(0) + colW(1), footH, { align: 'left', color: C.ink, font: FONT('800 26px') });
  cell(ctx, won(rep.due) + '원', colX(2), y, colW(2), footH, { align: 'right', color: C.ink, font: FONT('800 24px') });
  cell(ctx, won(rep.paid) + '원', colX(3), y, colW(3), footH, { align: 'right', color: C.ink, font: FONT('800 24px') });
  ctx.strokeStyle = hx(C.teal); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, y + 0.5); ctx.lineTo(mx + CW, y + 0.5); ctx.stroke();

  saveCanvas(cv, `납부현황_${rep.building?.name || '건물'}_${month}.png`);
}

export async function exportBuildingExcel(buildingId, month = monthKey()) {
  let EJS;
  try { EJS = await loadExcelJS(); } catch (e) { return toast(e.message, 'bad'); }
  const rep = await buildingRows(buildingId, month);
  const wb = new EJS.Workbook();
  const ws = wb.addWorksheet('납부현황', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 10 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 12 }];
  const FMT = '#,##0"원"';

  ws.mergeCells('A1:E1'); ws.getRow(1).height = 42;
  styleCell(ws.getCell('A1'), { fill: C.navy, font: { size: 17, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: 'center' } });
  ws.getCell('A1').value = `${rep.building?.name || '건물'} — ${formatMonth(month)} 납부 현황`;
  ws.mergeCells('A2:B2'); ws.getRow(2).height = 22;
  ['A2', 'C2', 'D2', 'E2'].forEach((a, i) => { const lbl = ['전체 세입자', '완납', '미납', ''][i]; styleCell(ws.getCell(a), { fill: C.beige, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); ws.getCell(a).value = lbl; });
  ws.mergeCells('A3:B3'); ws.getRow(3).height = 28;
  const vv = [rep.count + '명', rep.ok + '명', rep.bad + '명', ''];
  ['A3', 'C3', 'D3', 'E3'].forEach((a, i) => { styleCell(ws.getCell(a), { fill: C.beige, font: { size: 14, bold: true, color: { argb: argb(i === 2 ? C.bad : C.teal) } }, align: { horizontal: 'center' } }); ws.getCell(a).value = vv[i]; });

  ws.getRow(4).height = 24;
  ['호실', '이름', '청구', '받음', '상태'].forEach((h, i) => { const c = ws.getRow(4).getCell(i + 1); styleCell(c, { fill: C.teal, font: { size: 11, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: i === 1 ? 'left' : i >= 2 && i <= 3 ? 'right' : 'center' } }); c.value = h; });

  let r = 5;
  rep.rows.forEach((row, idx) => {
    const R = ws.getRow(r); R.height = 20; const z = idx % 2 === 0 ? C.white : C.zebra;
    styleCell(R.getCell(1), { fill: z, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); R.getCell(1).value = row.unit;
    styleCell(R.getCell(2), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } }); R.getCell(2).value = row.name;
    styleCell(R.getCell(3), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(3).value = row.due;
    styleCell(R.getCell(4), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(4).value = row.paid;
    styleCell(R.getCell(5), { fill: z, font: { size: 11, bold: true, color: { argb: argb(stColor(row.state)) } }, align: { horizontal: 'center' } }); R.getCell(5).value = STATUS[row.state].label;
    r++;
  });
  const R = ws.getRow(r); R.height = 26;
  ws.mergeCells(r, 1, r, 2);
  styleCell(R.getCell(1), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } }); R.getCell(1).value = '합계';
  styleCell(R.getCell(3), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(3).value = rep.due;
  styleCell(R.getCell(4), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(4).value = rep.paid;
  styleCell(R.getCell(5), { fill: C.beige }); R.getCell(5).value = '';

  const buf = await wb.xlsx.writeBuffer();
  download(`납부현황_${rep.building?.name || '건물'}_${month}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  toast('엑셀 파일을 내려받았어요', 'ok');
}
