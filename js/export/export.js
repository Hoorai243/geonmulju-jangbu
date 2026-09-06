// 내보내기 — 남에게 건네줄 문서. 가독성 최우선.
// 엑셀: 서식 있는 .xlsx (ExcelJS, js/vendor/exceljs.min.js 를 필요할 때만 불러옴)
// 이미지: A4 세로 리포트 (Canvas). 색/레이아웃은 참고 디자인과 동일 팔레트.
import * as store from './../store.js';
import { won, formatMonth, monthKey, addMonths, compareMonth, todayISO, toast , unitLabel } from '../util.js';
import { STATUS } from '../ui/shell.js';
import { saveFile, saveMedia } from './save-file.js';

/* ================= 팔레트 ================= */
const C = {
  navy: '18364D', teal: '11877A', ink: '26343C', gray: '7A858A',
  beige: 'F5F0E7', zebra: 'EDF5F3', mint: 'DCEFEA', line: 'D7DEDE', white: 'FFFFFF',
  ok: '11877A', bad: 'C0392B', warn: 'B8860B', idle: '7A858A', blue: '1D6FE0',
};
const hx = (h) => '#' + h;
const argb = (h) => 'FF' + h;
const stColor = (s) => ({ ok: C.ok, part: C.warn, bad: C.bad, idle: C.idle }[s] || C.idle);

/* ================= 공통 ================= */
// 웹: 브라우저 다운로드 / 앱: 파일 저장 후 공유창 (save-file.js 가 알아서 처리 + 안내)
function download(filename, blob) {
  return saveFile(filename, blob);
}
// 엑셀 저장 — 앱: 다운로드 > 건물주장부엑셀 폴더 / 웹: 브라우저 다운로드
function saveExcel(filename, blob) {
  return saveMedia(filename, blob, 'excel');
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
const srcTag = (p) => (p.source === 'bank' ? ' (은행)' : ' (직접)');

async function tenantReport(t, { bankOnly = false } = {}) {
  const base = t.rentHistory?.[0]?.from || t.contractStart;
  // 장부 시작월(trackStart)이 있으면 그 달부터 — 요약/원장과 같은 범위로 맞춰 초과/부족이 어긋나지 않게
  const start = (t.trackStart && base && compareMonth(t.trackStart, base) > 0) ? t.trackStart : base;
  const end = (t.status === 'movedout' && t.movedOutAt) ? monthKey(new Date(t.movedOutAt)) : monthKey();
  const allPays = await store.getAllPaymentsForTenant(t.id);
  let bankCount = 0, manualCount = 0;
  allPays.forEach((p) => { if (p.source === 'bank') bankCount++; else manualCount++; });
  const pays = bankOnly ? allPays.filter((p) => p.source === 'bank') : allPays;
  const byMonth = {};
  pays.forEach((p) => (byMonth[p.month] || (byMonth[p.month] = [])).push(p));

  const noteOf = (p) => (p.source === 'bank' ? '은행 확인' : (p.note ? p.note : '직접 입력'));
  const groups = [];
  let m = start, total = 0, totalDue = 0, months = 0, guard = 0;
  while (compareMonth(m, end) <= 0 && guard++ < 600) {
    months++;
    const due = store.ratesForMonth(t, m).total;   // 그 달 냈어야 할 금액(청구)
    totalDue += due;
    const ps = (byMonth[m] || []).slice().sort((a, b) => ((a.paidAt || '') < (b.paidAt || '') ? -1 : 1));
    if (ps.length === 0) {
      groups.push({ month: m, due, rows: [{ date: '', payer: '입금 없음', amount: null, note: '' }] });
    } else {
      total += ps.reduce((s, p) => s + p.amount, 0);
      groups.push({ month: m, due, rows: ps.map((p) => ({ date: p.paidAt, payer: p.depositorName || '-', amount: p.amount, source: p.source, note: noteOf(p) })) });
    }
    m = addMonths(m, 1);
  }
  // 보증금 내역(은행 입금 포함) — 세입자 거래내역에 같이 보여준다
  const ledger = await store.getLedger(t.id);
  const TYPE = { in: '보증금 받음', deduct: '보증금 차감', refund: '보증금 환불' };
  const deposits = (bankOnly ? ledger.filter((l) => l.source === 'bank') : ledger)
    .map((l) => ({ date: l.date, type: TYPE[l.type] || l.type, amount: l.amount, memo: (l.source === 'bank' ? '은행 · ' : '') + (l.memo || l.category || '') }));
  const dates = pays.map((p) => p.paidAt).filter(Boolean).sort();
  return {
    title: `${t.name}${t.businessName ? '(' + t.businessName + ')' : ''} — 거래내역${bankOnly ? ' (은행 확인분만)' : ''}`,
    groups, total, totalDue, months, bankCount, manualCount, bankOnly, deposits,
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
// 이미지 저장 — 앱: 사진 > 건물주장부 폴더 / 웹: 브라우저 다운로드
function saveCanvas(cv, filename) {
  cv.toBlob((b) => { saveMedia(filename, b, 'image'); }, 'image/png');
}

const TCOLS = [
  { label: '월', w: 11, align: 'center' },
  { label: '거래일', w: 15, align: 'center' },
  { label: '입금자', w: 23, align: 'left' },
  { label: '청구', w: 17, align: 'right' },
  { label: '입금액', w: 17, align: 'right' },
  { label: '비고', w: 17, align: 'left' },
];

export async function exportTenantImage(t, opts = {}) {
  const rep = await tenantReport(t, opts);
  const W = 1320, mx = 60, CW = W - mx * 2;
  const rowH = 54, headerH = 60, titleH = 112, sumH = 140, subH = 52, footH = 62, top = 60;
  const totalRows = rep.groups.reduce((s, g) => s + g.rows.length, 0);
  const dep = rep.deposits || [];
  const depBlock = dep.length ? (52 + headerH + dep.length * rowH + footH + 24) : 0;
  const H = top + titleH + sumH + subH + headerH + totalRows * rowH + footH + depBlock + 60;
  const { cv, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

  const xs = []; let cx = mx; TCOLS.forEach((c) => { xs.push(cx); cx += CW * c.w / 100; });
  const colX = (i) => xs[i], colW = (i) => CW * TCOLS[i].w / 100;

  let y = top;
  ctx.fillStyle = hx(C.navy); ctx.fillRect(mx, y, CW, titleH);
  cell(ctx, rep.title, mx, y, CW, titleH, { align: 'center', color: C.white, font: FONT('800 38px') });
  y += titleH;
  // 요약 밴드: 확인기간(개월) · 총 청구 · 총 실제입금
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, sumH);
  const stats = [['확인 기간', rep.months + '개월'], ['총 청구(냈어야 할)', won(rep.totalDue) + '원'], ['총 실제 입금', won(rep.total) + '원']];
  const bw = CW / 3;
  stats.forEach((s, i) => {
    cell(ctx, s[0], mx + bw * i, y + 12, bw, 40, { align: 'center', color: C.ink, font: FONT('700 23px') });
    cell(ctx, s[1], mx + bw * i, y + 60, bw, 56, { align: 'center', color: i === 1 ? C.ink : C.teal, font: FONT('800 34px') });
  });
  y += sumH;
  ctx.fillStyle = hx(C.mint); ctx.fillRect(mx, y, CW, subH);
  cell(ctx, `확인기간 ${rep.periodStart} → ${rep.periodEnd}`, mx, y, CW, subH, { align: 'center', color: C.teal, font: FONT('700 24px') });
  y += subH;
  // 헤더
  ctx.fillStyle = hx(C.teal); ctx.fillRect(mx, y, CW, headerH);
  TCOLS.forEach((c, i) => cell(ctx, c.label, colX(i), y, colW(i), headerH, { align: c.align === 'right' ? 'right' : c.align === 'left' ? 'left' : 'center', color: C.white, font: FONT('700 24px') }));
  const tableTop = y; y += headerH;
  let gi = 0;
  for (const g of rep.groups) {
    const gTop = y, gH = g.rows.length * rowH;
    ctx.fillStyle = hx(gi % 2 === 0 ? C.white : C.zebra); ctx.fillRect(mx, gTop, CW, gH);
    cell(ctx, formatMonth(g.month).replace('년 ', '.').replace('월', ''), colX(0), gTop, colW(0), gH, { align: 'center', color: C.ink, font: FONT('700 23px') });
    cell(ctx, g.due ? won(g.due) + '원' : '-', colX(3), gTop, colW(3), gH, { align: 'right', color: C.gray, font: FONT('600 22px') }); // 청구(월 병합)
    g.rows.forEach((r, ri) => {
      const ry = gTop + ri * rowH;
      if (r.amount == null) {
        cell(ctx, '입금 없음', colX(1), ry, colW(1) + colW(2), rowH, { align: 'center', color: C.gray, font: FONT('600 22px') });
        cell(ctx, '-', colX(4), ry, colW(4), rowH, { align: 'right', color: C.gray, font: FONT('600 22px') });
      } else {
        cell(ctx, r.date, colX(1), ry, colW(1), rowH, { align: 'center', color: C.ink, font: FONT('600 21px') });
        cell(ctx, r.payer, colX(2), ry, colW(2), rowH, { align: 'left', color: C.ink, font: FONT('600 21px') });
        cell(ctx, won(r.amount) + '원', colX(4), ry, colW(4), rowH, { align: 'right', color: C.ink, font: FONT('700 23px') });
        cell(ctx, r.note || '', colX(5), ry, colW(5), rowH, { align: 'left', color: r.source === 'bank' ? C.gray : C.warn, font: FONT('600 20px') });
      }
    });
    ctx.strokeStyle = hx(C.line); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, gTop + gH + 0.5); ctx.lineTo(mx + CW, gTop + gH + 0.5); ctx.stroke();
    y += gH; gi++;
  }
  ctx.strokeStyle = hx(C.line); ctx.lineWidth = 1;
  for (let i = 1; i < TCOLS.length; i++) { ctx.beginPath(); ctx.moveTo(colX(i) + 0.5, tableTop); ctx.lineTo(colX(i) + 0.5, y); ctx.stroke(); }
  ctx.strokeRect(mx + 0.5, tableTop + 0.5, CW, y - tableTop);
  // 합계(청구·입금)
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, footH);
  cell(ctx, '합계', mx, y, colW(0) + colW(1) + colW(2), footH, { align: 'left', color: C.ink, font: FONT('800 25px') });
  cell(ctx, won(rep.totalDue) + '원', colX(3), y, colW(3), footH, { align: 'right', color: C.ink, font: FONT('800 23px') });
  cell(ctx, won(rep.total) + '원', colX(4), y, colW(4), footH, { align: 'right', color: C.ink, font: FONT('800 23px') });
  { const d = rep.total - rep.totalDue; // 초과(파랑)/부족(빨강)
    cell(ctx, d > 0 ? '초과 ' + won(d) + '원' : d < 0 ? '부족 ' + won(-d) + '원' : '딱 맞음', colX(5), y, colW(5), footH, { align: 'left', color: d > 0 ? C.blue : d < 0 ? C.bad : C.teal, font: FONT('800 19px'), pad: 10 }); }
  ctx.strokeStyle = hx(C.teal); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, y + 0.5); ctx.lineTo(mx + CW, y + 0.5); ctx.stroke();
  y += footH;

  // 보증금 내역 (은행 입금 포함)
  if (dep.length) {
    y += 24;
    const dcols = [{ w: 20, a: 'center' }, { w: 26, a: 'left' }, { w: 24, a: 'right' }, { w: 30, a: 'left' }];
    const dxs = []; let dcx = mx; dcols.forEach((c) => { dxs.push(dcx); dcx += CW * c.w / 100; });
    const dX = (i) => dxs[i], dW = (i) => CW * dcols[i].w / 100;
    ctx.fillStyle = hx(C.navy); ctx.fillRect(mx, y, CW, 52);
    cell(ctx, '보증금 내역', mx, y, CW, 52, { align: 'center', color: C.white, font: FONT('800 26px') });
    y += 52;
    ctx.fillStyle = hx(C.teal); ctx.fillRect(mx, y, CW, headerH);
    ['날짜', '구분', '금액', '비고'].forEach((l, i) => cell(ctx, l, dX(i), y, dW(i), headerH, { align: dcols[i].a === 'right' ? 'right' : dcols[i].a === 'left' ? 'left' : 'center', color: C.white, font: FONT('700 24px') }));
    const dTop = y; y += headerH;
    let held = 0;
    dep.forEach((d, i) => {
      ctx.fillStyle = hx(i % 2 === 0 ? C.white : C.zebra); ctx.fillRect(mx, y, CW, rowH);
      const isIn = /받음/.test(d.type);
      held += isIn ? d.amount : -d.amount;
      cell(ctx, d.date, dX(0), y, dW(0), rowH, { align: 'center', color: C.ink, font: FONT('600 21px') });
      cell(ctx, d.type, dX(1), y, dW(1), rowH, { align: 'left', color: isIn ? C.teal : C.bad, font: FONT('700 22px') });
      cell(ctx, (isIn ? '' : '-') + won(d.amount) + '원', dX(2), y, dW(2), rowH, { align: 'right', color: isIn ? C.ink : C.bad, font: FONT('700 22px') });
      cell(ctx, d.memo || '', dX(3), y, dW(3), rowH, { align: 'left', color: C.gray, font: FONT('600 20px') });
      y += rowH;
    });
    ctx.strokeStyle = hx(C.line); ctx.lineWidth = 1;
    for (let i = 1; i < dcols.length; i++) { ctx.beginPath(); ctx.moveTo(dX(i) + 0.5, dTop); ctx.lineTo(dX(i) + 0.5, y); ctx.stroke(); }
    ctx.strokeRect(mx + 0.5, dTop + 0.5, CW, y - dTop);
    ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, footH);
    cell(ctx, '현재 보관 중', mx, y, dW(0) + dW(1), footH, { align: 'left', color: C.ink, font: FONT('800 24px') });
    cell(ctx, won(held) + '원', dX(2), y, dW(2), footH, { align: 'right', color: C.ink, font: FONT('800 23px') });
    ctx.strokeStyle = hx(C.teal); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, y + 0.5); ctx.lineTo(mx + CW, y + 0.5); ctx.stroke();
  }

  saveCanvas(cv, `거래내역_${unitLabel(t.unit)}_${t.name}${opts.bankOnly ? '_은행확인분' : ''}.png`);
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

export async function exportTenantExcel(t, opts = {}) {
  let EJS;
  try { EJS = await loadExcelJS(); } catch (e) { return toast(e.message, 'bad'); }
  const rep = await tenantReport(t, opts);
  const wb = new EJS.Workbook();
  const ws = wb.addWorksheet('거래내역', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
  });
  ws.columns = [{ width: 11 }, { width: 13 }, { width: 24 }, { width: 15 }, { width: 15 }, { width: 22 }];
  const FMT = '#,##0"원"';

  // 1 제목
  ws.mergeCells('A1:F1'); ws.getRow(1).height = 40;
  styleCell(ws.getCell('A1'), { fill: C.navy, font: { size: 17, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: 'center' } });
  ws.getCell('A1').value = rep.title;
  // 2 요약 라벨 / 3 값 (확인기간 · 총청구 · 총입금)
  ws.mergeCells('A2:B2'); ws.mergeCells('C2:D2'); ws.mergeCells('E2:F2'); ws.getRow(2).height = 22;
  ['A2', 'C2', 'E2'].forEach((a, i) => { styleCell(ws.getCell(a), { fill: C.beige, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); ws.getCell(a).value = ['확인 기간', '총 청구(냈어야 할)', '총 실제 입금'][i]; });
  ws.mergeCells('A3:B3'); ws.mergeCells('C3:D3'); ws.mergeCells('E3:F3'); ws.getRow(3).height = 28;
  const vals = [rep.months + '개월', won(rep.totalDue) + '원', won(rep.total) + '원'];
  ['A3', 'C3', 'E3'].forEach((a, i) => { styleCell(ws.getCell(a), { fill: C.beige, font: { size: 14, bold: true, color: { argb: argb(i === 1 ? C.ink : C.teal) } }, align: { horizontal: 'center' } }); ws.getCell(a).value = vals[i]; });
  // 4 확인기간
  ws.mergeCells('A4:F4'); ws.getRow(4).height = 22;
  styleCell(ws.getCell('A4'), { fill: C.mint, font: { size: 11, bold: true, color: { argb: argb(C.teal) } }, align: { horizontal: 'center' } });
  ws.getCell('A4').value = `확인기간 ${rep.periodStart} → ${rep.periodEnd}`;
  // 5 헤더
  ws.getRow(5).height = 24;
  ['월', '거래일', '입금자', '청구', '입금액', '비고'].forEach((h, i) => {
    const c = ws.getRow(5).getCell(i + 1);
    styleCell(c, { fill: C.teal, font: { size: 11, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: i === 2 || i === 5 ? 'left' : i === 3 || i === 4 ? 'right' : 'center' } });
    c.value = h;
  });

  // 데이터
  let r = 6, gi = 0;
  for (const g of rep.groups) {
    const first = r, zebra = gi % 2 === 0 ? C.white : C.zebra;
    g.rows.forEach((row) => {
      const R = ws.getRow(r); R.height = 20;
      styleCell(R.getCell(1), { fill: zebra, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } });
      styleCell(R.getCell(4), { fill: zebra, font: { size: 11, color: { argb: argb(C.gray) } }, align: { horizontal: 'right' }, numFmt: FMT }); // 청구(월 병합)
      if (row.amount == null) {
        styleCell(R.getCell(2), { fill: zebra });
        styleCell(R.getCell(3), { fill: zebra, font: { size: 11, color: { argb: argb(C.gray) } }, align: { horizontal: 'center' } });
        R.getCell(3).value = '입금 없음';
        styleCell(R.getCell(5), { fill: zebra, font: { size: 11, color: { argb: argb(C.gray) } }, align: { horizontal: 'right' } });
        R.getCell(5).value = '-';
        styleCell(R.getCell(6), { fill: zebra });
      } else {
        styleCell(R.getCell(2), { fill: zebra, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } });
        R.getCell(2).value = row.date;
        styleCell(R.getCell(3), { fill: zebra, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } });
        R.getCell(3).value = row.payer;
        styleCell(R.getCell(5), { fill: zebra, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT });
        R.getCell(5).value = row.amount;
        styleCell(R.getCell(6), { fill: zebra, font: { size: 10, color: { argb: argb(row.source === 'bank' ? C.gray : C.warn) } }, align: { horizontal: 'left' } });
        R.getCell(6).value = row.note || '';
      }
      r++;
    });
    ws.getCell(first, 1).value = formatMonth(g.month).replace('년 ', '.').replace('월', '');
    ws.getCell(first, 4).value = g.due || 0;
    if (r - 1 > first) { ws.mergeCells(first, 1, r - 1, 1); ws.mergeCells(first, 4, r - 1, 4); }
    gi++;
  }
  // 합계 (청구·입금)
  const R = ws.getRow(r); R.height = 26;
  ws.mergeCells(r, 1, r, 3);
  styleCell(R.getCell(1), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } });
  R.getCell(1).value = `합계 · 은행 ${rep.bankCount}건 / 직접 ${rep.manualCount}건`;
  styleCell(R.getCell(4), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(4).value = rep.totalDue;
  styleCell(R.getCell(5), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(5).value = rep.total;
  { const d = rep.total - rep.totalDue; // 초과(파랑)/부족(빨강)
    styleCell(R.getCell(6), { fill: C.beige, font: { size: 11, bold: true, color: { argb: argb(d > 0 ? C.blue : d < 0 ? C.bad : C.teal) } }, align: { horizontal: 'left' } });
    R.getCell(6).value = d > 0 ? '초과 ' + won(d) + '원' : d < 0 ? '부족 ' + won(-d) + '원' : '딱 맞음'; }
  r++;

  // 보증금 내역
  if ((rep.deposits || []).length) {
    r++;
    ws.mergeCells(r, 1, r, 6); ws.getRow(r).height = 26;
    styleCell(ws.getCell(r, 1), { fill: C.navy, font: { size: 13, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: 'center' } });
    ws.getCell(r, 1).value = '보증금 내역'; r++;
    const hr = ws.getRow(r); hr.height = 22;
    ['날짜', '구분', '', '금액', '비고', ''].forEach((h, i) => { styleCell(hr.getCell(i + 1), { fill: C.teal, font: { size: 11, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: i === 3 ? 'right' : 'left' } }); hr.getCell(i + 1).value = h; });
    ws.mergeCells(r, 2, r, 3); ws.mergeCells(r, 5, r, 6); r++;
    let held = 0;
    rep.deposits.forEach((d, idx) => {
      const DR = ws.getRow(r); DR.height = 20; const z = idx % 2 === 0 ? C.white : C.zebra;
      const isIn = /받음/.test(d.type); held += isIn ? d.amount : -d.amount;
      styleCell(DR.getCell(1), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); DR.getCell(1).value = d.date;
      styleCell(DR.getCell(2), { fill: z, font: { size: 11, bold: true, color: { argb: argb(isIn ? C.teal : C.bad) } }, align: { horizontal: 'left' } }); DR.getCell(2).value = d.type; ws.mergeCells(r, 2, r, 3); styleCell(DR.getCell(3), { fill: z });
      styleCell(DR.getCell(4), { fill: z, font: { size: 11, bold: true, color: { argb: argb(isIn ? C.ink : C.bad) } }, align: { horizontal: 'right' }, numFmt: FMT }); DR.getCell(4).value = isIn ? d.amount : -d.amount;
      styleCell(DR.getCell(5), { fill: z, font: { size: 10, color: { argb: argb(C.gray) } }, align: { horizontal: 'left' } }); DR.getCell(5).value = d.memo || ''; ws.mergeCells(r, 5, r, 6); styleCell(DR.getCell(6), { fill: z });
      r++;
    });
    const FR = ws.getRow(r); FR.height = 24; ws.mergeCells(r, 1, r, 3);
    styleCell(FR.getCell(1), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } }); FR.getCell(1).value = '현재 보관 중';
    styleCell(FR.getCell(4), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); FR.getCell(4).value = held;
    ws.mergeCells(r, 5, r, 6); styleCell(FR.getCell(5), { fill: C.beige });
  }

  const buf = await wb.xlsx.writeBuffer();
  saveExcel(`거래내역_${unitLabel(t.unit)}_${t.name}${opts.bankOnly ? '_은행확인분' : ''}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/* ================= 건물 전체(이번 달) ================= */
async function buildingRows(buildingId, month) {
  const building = await store.getBuilding(buildingId);
  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');
  const rows = []; let due = 0, paid = 0, ok = 0, bad = 0;
  for (const t of tenants) {
    const led = await store.tenantLedger(t, month);
    const s = led.map.get(month) || { state: 'idle', due: 0, avail: 0 };
    due += s.due; paid += Math.min(s.avail || 0, s.due);
    if (s.state === 'ok') ok++; else if (s.state === 'bad') bad++;
    rows.push({ unit: t.unit, name: t.name, due: s.due, paid: Math.min(s.avail || 0, s.due), state: s.state });
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

// 부가세·세금계산서 정리 엑셀
export async function exportTaxExcel(buildingId, months, periodLabel) {
  let EJS;
  try { EJS = await loadExcelJS(); } catch (e) { return toast(e.message, 'bad'); }
  const building = await store.getBuilding(buildingId);
  const { rows, totals } = await store.taxSummary(buildingId, months);
  const wb = new EJS.Workbook();
  const ws = wb.addWorksheet('부가세', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 8 }, { width: 16 }, { width: 18 }, { width: 15 }, { width: 13 }, { width: 15 }];
  const FMT = '#,##0"원"';

  ws.mergeCells('A1:F1'); ws.getRow(1).height = 40;
  styleCell(ws.getCell('A1'), { fill: C.navy, font: { size: 16, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: 'center' } });
  ws.getCell('A1').value = `${building?.name || '건물'} · 부가세·세금계산서 (${periodLabel})`;
  ws.getRow(2).height = 24;
  ['호실', '이름', '사업자번호', '공급가액', '부가세', '합계'].forEach((hh, i) => {
    const c = ws.getRow(2).getCell(i + 1);
    styleCell(c, { fill: C.teal, font: { size: 11, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: i >= 3 ? 'right' : i === 1 ? 'left' : 'center' } });
    c.value = hh;
  });
  let r = 3;
  rows.forEach((row, idx) => {
    const R = ws.getRow(r); R.height = 20; const z = idx % 2 === 0 ? C.white : C.zebra;
    styleCell(R.getCell(1), { fill: z, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); R.getCell(1).value = row.tenant.unit;
    styleCell(R.getCell(2), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } }); R.getCell(2).value = row.tenant.name;
    styleCell(R.getCell(3), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); R.getCell(3).value = row.tenant.bizNo || '';
    styleCell(R.getCell(4), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(4).value = row.supply;
    styleCell(R.getCell(5), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(5).value = row.vat;
    styleCell(R.getCell(6), { fill: z, font: { size: 11, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(6).value = row.total;
    r++;
  });
  const R = ws.getRow(r); R.height = 26; ws.mergeCells(r, 1, r, 3);
  styleCell(R.getCell(1), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } }); R.getCell(1).value = '합계';
  styleCell(R.getCell(4), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(4).value = totals.supply;
  styleCell(R.getCell(5), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.teal) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(5).value = totals.vat;
  styleCell(R.getCell(6), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(6).value = totals.total;

  const buf = await wb.xlsx.writeBuffer();
  saveExcel(`부가세_${building?.name || '건물'}_${periodLabel}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
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
  saveExcel(`납부현황_${rep.building?.name || '건물'}_${month}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/* ================= 납부 요약(전체 정산) 내보내기 ================= */
const ST_LABEL = { ok: '완납', part: '부분', bad: '미납', idle: '미확인' };
async function summaryReport(t, { from = '', to = '' } = {}) {
  const upto = (t.status === 'movedout' && t.movedOutAt) ? monthKey(new Date(t.movedOutAt)) : monthKey();
  const { map } = await store.tenantLedger(t, upto);
  const all = [...map.keys()].sort((a, b) => (a < b ? -1 : 1));
  const months = all.filter((m) => (!from || m >= from) && (!to || m <= to));
  // 후납 반영 상태(점 색·완납못한달) — 화면과 똑같이. 전체 낸 돈을 오래된 달부터 채움.
  const netState = new Map();
  { let pool = months.reduce((sum, mm) => sum + (map.get(mm)?.paid || 0), 0);
    for (const mm of months) { const s = map.get(mm); if (s.due <= 0) { netState.set(mm, s.paid > 0 ? 'ok' : 'idle'); continue; } const cov = Math.min(pool, s.due); pool -= cov; netState.set(mm, cov >= s.due ? 'ok' : cov > 0 ? 'part' : s.state); } }
  let totalDue = 0, totalPaid = 0, lateCount = 0, running = 0; const rows = [];
  for (const m of months) { const s = map.get(m); const ns = netState.get(m) || s.state; totalDue += s.due; totalPaid += s.paid; if (s.due > 0 && ns !== 'ok') lateCount++; running += s.paid - s.due; rows.push({ m, due: s.due, paid: s.paid, state: ns, running }); }
  const filtered = !!(from || to);
  return { t, rows, totalDue, totalPaid, diff: totalPaid - totalDue, lateCount, filtered, periodLabel: filtered ? `${from || '처음'}~${to || '지금'}` : '전체기간' };
}
const sgn = (n) => (n < 0 ? '-' : n > 0 ? '+' : '') + won(Math.abs(n)) + '원';

export async function exportSummaryImage(t, opts = {}) {
  const rep = await summaryReport(t, opts);
  const W = 1240, mx = 60, CW = W - mx * 2;
  const rowH = 50, headerH = 60, titleH = 110, sumH = 150, footH = 60, top = 56;
  const H = top + titleH + sumH + headerH + rep.rows.length * rowH + footH + 60;
  const { cv, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const cols = [{ w: 16, align: 'center' }, { w: 22, align: 'right' }, { w: 22, align: 'right' }, { w: 20, align: 'right' }, { w: 20, align: 'right' }];
  const labels = ['월', '청구', '받음', '차이', '누적'];
  const xs = []; let cx = mx; cols.forEach((c) => { xs.push(cx); cx += CW * c.w / 100; });
  const colX = (i) => xs[i], colW = (i) => CW * cols[i].w / 100;

  let y = top;
  ctx.fillStyle = hx(C.navy); ctx.fillRect(mx, y, CW, titleH);
  cell(ctx, `${unitLabel(t.unit)} ${t.name} — 납부 요약`, mx, y, CW, titleH - 34, { align: 'center', color: C.white, font: FONT('800 34px') });
  cell(ctx, rep.periodLabel, mx, y + titleH - 44, CW, 34, { align: 'center', color: C.mint, font: FONT('600 22px') });
  y += titleH;
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, sumH);
  const stats = [['청구', won(rep.totalDue) + '원', C.ink], ['받음', won(rep.totalPaid) + '원', C.teal], [rep.diff < 0 ? '밀린 돈' : rep.diff > 0 ? '미리 낸 돈' : '차액', won(Math.abs(rep.diff)) + '원', rep.diff < 0 ? C.bad : C.teal]];
  const bw = CW / 3;
  stats.forEach((s, i) => {
    cell(ctx, s[0], mx + bw * i, y + 14, bw, 40, { align: 'center', color: C.gray, font: FONT('700 22px') });
    cell(ctx, s[1], mx + bw * i, y + 62, bw, 56, { align: 'center', color: s[2], font: FONT('800 34px') });
  });
  cell(ctx, `완납 못한 달 ${rep.lateCount}번`, mx, y + sumH - 34, CW, 30, { align: 'center', color: C.gray, font: FONT('600 20px') });
  y += sumH;
  ctx.fillStyle = hx(C.teal); ctx.fillRect(mx, y, CW, headerH);
  labels.forEach((l, i) => cell(ctx, l, colX(i), y, colW(i), headerH, { align: cols[i].align === 'right' ? 'right' : 'center', color: C.white, font: FONT('700 24px') }));
  const tableTop = y; y += headerH;
  rep.rows.forEach((row, i) => {
    ctx.fillStyle = hx(i % 2 === 0 ? C.white : C.zebra); ctx.fillRect(mx, y, CW, rowH);
    ctx.beginPath(); ctx.arc(colX(0) + 20, y + rowH / 2, 6, 0, Math.PI * 2); ctx.fillStyle = hx(stColor(row.state)); ctx.fill();
    cell(ctx, row.m, colX(0) + 16, y, colW(0) - 16, rowH, { align: 'center', color: C.ink, font: FONT('600 21px') });
    cell(ctx, row.due ? won(row.due) : '-', colX(1), y, colW(1), rowH, { align: 'right', color: C.ink });
    cell(ctx, row.paid ? won(row.paid) : '-', colX(2), y, colW(2), rowH, { align: 'right', color: row.paid > row.due ? C.teal : C.ink, font: row.paid > row.due ? FONT('800 22px') : FONT('600 22px') });
    { const d = row.paid - row.due; cell(ctx, d === 0 ? '0' : sgn(d), colX(3), y, colW(3), rowH, { align: 'right', color: d < 0 ? C.bad : d > 0 ? C.teal : C.gray }); }
    cell(ctx, sgn(row.running), colX(4), y, colW(4), rowH, { align: 'right', color: row.running < 0 ? C.bad : row.running > 0 ? C.teal : C.gray });
    y += rowH;
  });
  ctx.strokeStyle = hx(C.line); ctx.lineWidth = 1;
  for (let i = 1; i < cols.length; i++) { ctx.beginPath(); ctx.moveTo(colX(i) + 0.5, tableTop); ctx.lineTo(colX(i) + 0.5, y); ctx.stroke(); }
  ctx.strokeRect(mx + 0.5, tableTop + 0.5, CW, y - tableTop);
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, footH);
  cell(ctx, '합계', colX(0), y, colW(0), footH, { align: 'center', color: C.ink, font: FONT('800 24px') });
  cell(ctx, won(rep.totalDue) + '원', colX(1), y, colW(1), footH, { align: 'right', color: C.ink, font: FONT('800 22px') });
  cell(ctx, won(rep.totalPaid) + '원', colX(2), y, colW(2), footH, { align: 'right', color: C.ink, font: FONT('800 22px') });
  cell(ctx, sgn(rep.diff), colX(3), y, colW(3), footH, { align: 'right', color: rep.diff < 0 ? C.bad : C.teal, font: FONT('800 22px') });
  cell(ctx, sgn(rep.diff), colX(4), y, colW(4), footH, { align: 'right', color: rep.diff < 0 ? C.bad : C.teal, font: FONT('800 22px') });
  ctx.strokeStyle = hx(C.teal); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, y + 0.5); ctx.lineTo(mx + CW, y + 0.5); ctx.stroke();

  saveCanvas(cv, `납부요약_${t.name}_${rep.periodLabel}.png`);
}

export async function exportSummaryExcel(t, opts = {}) {
  let EJS; try { EJS = await loadExcelJS(); } catch (e) { return toast(e.message, 'bad'); }
  const rep = await summaryReport(t, opts);
  const wb = new EJS.Workbook();
  const ws = wb.addWorksheet('납부요약', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 12 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 9 }];
  const FMT = '#,##0"원"';
  ws.mergeCells('A1:F1'); ws.getRow(1).height = 40;
  styleCell(ws.getCell('A1'), { fill: C.navy, font: { size: 16, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: 'center' } });
  ws.getCell('A1').value = `${unitLabel(t.unit)} ${t.name} — 납부 요약 (${rep.periodLabel})`;
  ws.mergeCells('A2:F2'); ws.getRow(2).height = 22;
  styleCell(ws.getCell('A2'), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(rep.diff < 0 ? C.bad : C.teal) } }, align: { horizontal: 'center' } });
  ws.getCell('A2').value = `청구 ${won(rep.totalDue)}원 · 받음 ${won(rep.totalPaid)}원 · ${rep.diff < 0 ? '밀린 돈 ' + won(-rep.diff) : rep.diff > 0 ? '미리 낸 돈 ' + won(rep.diff) : '딱 맞음'}원 · 완납 못한 달 ${rep.lateCount}번`;
  ws.getRow(3).height = 24;
  ['월', '청구', '받음', '차이', '누적', '상태'].forEach((h, i) => { const c = ws.getRow(3).getCell(i + 1); styleCell(c, { fill: C.teal, font: { size: 11, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: i >= 1 && i <= 4 ? 'right' : 'center' } }); c.value = h; });
  let r = 4;
  rep.rows.forEach((row, idx) => {
    const R = ws.getRow(r); R.height = 20; const z = idx % 2 === 0 ? C.white : C.zebra;
    styleCell(R.getCell(1), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); R.getCell(1).value = row.m;
    styleCell(R.getCell(2), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(2).value = row.due || 0;
    styleCell(R.getCell(3), { fill: z, font: { size: 11, bold: row.paid > row.due, color: { argb: argb(row.paid > row.due ? C.teal : C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(3).value = row.paid || 0;
    { const d = (row.paid || 0) - (row.due || 0); styleCell(R.getCell(4), { fill: z, font: { size: 11, color: { argb: argb(d < 0 ? C.bad : d > 0 ? C.teal : C.gray) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(4).value = d; }
    styleCell(R.getCell(5), { fill: z, font: { size: 11, color: { argb: argb(row.running < 0 ? C.bad : row.running > 0 ? C.teal : C.gray) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(5).value = row.running;
    styleCell(R.getCell(6), { fill: z, font: { size: 11, bold: true, color: { argb: argb(stColor(row.state)) } }, align: { horizontal: 'center' } }); R.getCell(6).value = ST_LABEL[row.state] || '';
    r++;
  });
  const R = ws.getRow(r); R.height = 26;
  styleCell(R.getCell(1), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'center' } }); R.getCell(1).value = '합계';
  styleCell(R.getCell(2), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(2).value = rep.totalDue;
  styleCell(R.getCell(3), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(3).value = rep.totalPaid;
  styleCell(R.getCell(4), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(rep.diff < 0 ? C.bad : C.teal) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(4).value = rep.diff;
  styleCell(R.getCell(5), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(rep.diff < 0 ? C.bad : C.teal) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(5).value = rep.diff;
  styleCell(R.getCell(6), { fill: C.beige }); R.getCell(6).value = '';
  const buf = await wb.xlsx.writeBuffer();
  saveExcel(`납부요약_${t.name}_${rep.periodLabel}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/* ================= 빠진 달(월세/관리비) 내보내기 ================= */
async function missedReport(t, { from = '', to = '', miss = 'fee' } = {}) {
  const split = await store.tenantLedgerSplit(t, { from, to });
  const list = miss === 'rent' ? (split.rentMissed || []) : (split.feeMissed || []);
  const total = list.reduce((s, x) => s + x.short, 0);
  const kindLabel = miss === 'rent' ? '월세' : '관리비';
  const filtered = !!(from || to);
  return { t, list, total, kindLabel, periodLabel: filtered ? `${from || '처음'}~${to || '지금'}` : '전체기간' };
}

export async function exportMissedImage(t, opts = {}) {
  const rep = await missedReport(t, opts);
  const W = 900, mx = 60, CW = W - mx * 2;
  const rowH = 56, headerH = 60, titleH = 110, footH = 64, top = 56;
  const H = top + titleH + headerH + Math.max(rep.list.length, 1) * rowH + footH + 60;
  const { cv, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const cols = [{ w: 55, align: 'left' }, { w: 45, align: 'right' }];
  const xs = []; let cx = mx; cols.forEach((c) => { xs.push(cx); cx += CW * c.w / 100; });
  const colX = (i) => xs[i], colW = (i) => CW * cols[i].w / 100;

  let y = top;
  ctx.fillStyle = hx(C.navy); ctx.fillRect(mx, y, CW, titleH);
  cell(ctx, `${unitLabel(t.unit)} ${t.name} — ${rep.kindLabel} 빠진 달`, mx, y, CW, titleH - 34, { align: 'center', color: C.white, font: FONT('800 32px') });
  cell(ctx, rep.periodLabel, mx, y + titleH - 44, CW, 34, { align: 'center', color: C.mint, font: FONT('600 22px') });
  y += titleH;
  ctx.fillStyle = hx(C.teal); ctx.fillRect(mx, y, CW, headerH);
  cell(ctx, '월', colX(0), y, colW(0), headerH, { align: 'left', color: C.white, font: FONT('700 24px') });
  cell(ctx, '부족액', colX(1), y, colW(1), headerH, { align: 'right', color: C.white, font: FONT('700 24px') });
  const tableTop = y; y += headerH;
  if (!rep.list.length) {
    ctx.fillStyle = hx(C.white); ctx.fillRect(mx, y, CW, rowH);
    cell(ctx, `${rep.kindLabel} 빠진 달이 없어요`, mx, y, CW, rowH, { align: 'center', color: C.gray, font: FONT('600 23px') });
    y += rowH;
  } else {
    rep.list.forEach((x, i) => {
      ctx.fillStyle = hx(i % 2 === 0 ? C.white : C.zebra); ctx.fillRect(mx, y, CW, rowH);
      cell(ctx, formatMonth(x.month), colX(0), y, colW(0), rowH, { align: 'left', color: C.ink });
      cell(ctx, won(x.short) + '원', colX(1), y, colW(1), rowH, { align: 'right', color: C.bad, font: FONT('700 24px') });
      y += rowH;
    });
  }
  ctx.strokeStyle = hx(C.line); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(colX(1) + 0.5, tableTop); ctx.lineTo(colX(1) + 0.5, y); ctx.stroke();
  ctx.strokeRect(mx + 0.5, tableTop + 0.5, CW, y - tableTop);
  ctx.fillStyle = hx(C.beige); ctx.fillRect(mx, y, CW, footH);
  cell(ctx, `${rep.kindLabel} 부족 합계`, colX(0), y, colW(0), footH, { align: 'left', color: C.ink, font: FONT('800 25px') });
  cell(ctx, won(rep.total) + '원', colX(1), y, colW(1), footH, { align: 'right', color: C.bad, font: FONT('800 25px') });
  ctx.strokeStyle = hx(C.teal); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, y + 0.5); ctx.lineTo(mx + CW, y + 0.5); ctx.stroke();

  saveCanvas(cv, `${rep.kindLabel}빠진달_${t.name}_${rep.periodLabel}.png`);
}

export async function exportMissedExcel(t, opts = {}) {
  let EJS; try { EJS = await loadExcelJS(); } catch (e) { return toast(e.message, 'bad'); }
  const rep = await missedReport(t, opts);
  const wb = new EJS.Workbook();
  const ws = wb.addWorksheet(`${rep.kindLabel}빠진달`, { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 20 }, { width: 18 }];
  const FMT = '#,##0"원"';
  ws.mergeCells('A1:B1'); ws.getRow(1).height = 40;
  styleCell(ws.getCell('A1'), { fill: C.navy, font: { size: 15, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: 'center' } });
  ws.getCell('A1').value = `${unitLabel(t.unit)} ${t.name} — ${rep.kindLabel} 빠진 달 (${rep.periodLabel})`;
  ws.getRow(2).height = 24;
  ['월', '부족액'].forEach((hh, i) => { const c = ws.getRow(2).getCell(i + 1); styleCell(c, { fill: C.teal, font: { size: 11, bold: true, color: { argb: argb(C.white) } }, align: { horizontal: i === 1 ? 'right' : 'left' } }); c.value = hh; });
  let r = 3;
  if (!rep.list.length) {
    const R = ws.getRow(r); R.height = 20; ws.mergeCells(r, 1, r, 2);
    styleCell(R.getCell(1), { fill: C.white, font: { size: 11, color: { argb: argb(C.gray) } }, align: { horizontal: 'center' } }); R.getCell(1).value = `${rep.kindLabel} 빠진 달이 없어요`;
    r++;
  } else {
    rep.list.forEach((x, idx) => {
      const R = ws.getRow(r); R.height = 20; const z = idx % 2 === 0 ? C.white : C.zebra;
      styleCell(R.getCell(1), { fill: z, font: { size: 11, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } }); R.getCell(1).value = formatMonth(x.month);
      styleCell(R.getCell(2), { fill: z, font: { size: 11, bold: true, color: { argb: argb(C.bad) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(2).value = x.short;
      r++;
    });
  }
  const R = ws.getRow(r); R.height = 26;
  styleCell(R.getCell(1), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.ink) } }, align: { horizontal: 'left' } }); R.getCell(1).value = `${rep.kindLabel} 부족 합계`;
  styleCell(R.getCell(2), { fill: C.beige, font: { size: 12, bold: true, color: { argb: argb(C.bad) } }, align: { horizontal: 'right' }, numFmt: FMT }); R.getCell(2).value = rep.total;
  const buf = await wb.xlsx.writeBuffer();
  saveExcel(`${rep.kindLabel}빠진달_${t.name}_${rep.periodLabel}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
