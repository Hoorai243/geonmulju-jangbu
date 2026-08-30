// 내보내기 — 엑셀(CSV, 엑셀에서 바로 열림) + PNG 이미지(Canvas로 그림).
// 라이브러리 없이 오프라인에서 동작.
import * as store from '../store.js';
import { won, formatMonth, monthKey, addMonths, compareMonth, todayISO, toast } from '../util.js';
import { STATUS } from '../ui/shell.js';

/* ---------- 공통 ---------- */
function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toCSV(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  return new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' }); // BOM: 엑셀 한글 깨짐 방지
}

// 세입자의 월별 요약(계약시작~현재 또는 퇴거월)
async function tenantMonthly(t) {
  const start = t.rentHistory?.[0]?.from || t.contractStart;
  const end = t.status === 'movedout' && t.movedOutAt ? monthKey(new Date(t.movedOutAt)) : monthKey();
  const out = [];
  let m = start, guard = 0;
  while (compareMonth(m, end) <= 0 && guard++ < 600) {
    const pays = await store.getPaymentsForTenantMonth(t.id, m);
    const s = store.paymentStatus(t, m, pays);
    out.push({ month: m, due: s.due, paid: s.paid, remaining: s.remaining, state: s.state, pays });
    m = addMonths(m, 1);
  }
  return out.reverse(); // 최근이 위로
}

/* ---------- 엑셀(CSV) ---------- */
export async function exportTenantExcel(t) {
  const rows = [['건물주 장부 · 세입자 입금 내역']];
  rows.push([`${t.unit}호`, t.name, t.kind === 'shop' ? '상가' : '주택', t.businessName || '']);
  rows.push([`계약: ${formatMonth(t.contractStart)} ~ ${t.contractEnd ? formatMonth(t.contractEnd) : '미정'}`]);
  rows.push([]);
  rows.push(['월', '청구액', '받은금액', '남은금액', '상태', '입금상세']);
  const monthly = await tenantMonthly(t);
  for (const r of monthly) {
    const detail = r.pays.map((p) => `${p.paidAt} ${p.depositorName || ''} ${won(p.amount)}원`).join(' / ');
    rows.push([formatMonth(r.month), r.due, r.paid, r.remaining, STATUS[r.state].label, detail]);
  }
  download(`장부_${t.unit}호_${t.name}_${todayISO()}.csv`, toCSV(rows));
  toast('엑셀 파일을 내려받았어요', 'ok');
}

export async function exportBuildingExcel(buildingId, month = monthKey()) {
  const building = await store.getBuilding(buildingId);
  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');
  const rows = [[`${building?.name || '건물'} · ${formatMonth(month)} 납부 현황`], []];
  rows.push(['호실', '이름', '청구액', '받은금액', '남은금액', '상태']);
  let sumDue = 0, sumPaid = 0;
  for (const t of tenants) {
    const pays = await store.getPaymentsForTenantMonth(t.id, month);
    const s = store.paymentStatus(t, month, pays);
    sumDue += s.due; sumPaid += s.paid;
    rows.push([t.unit, t.name, s.due, s.paid, s.remaining, STATUS[s.state].label]);
  }
  rows.push([]);
  rows.push(['합계', '', sumDue, sumPaid, sumDue - sumPaid, '']);
  download(`장부_${building?.name || '건물'}_${month}.csv`, toCSV(rows));
  toast('엑셀 파일을 내려받았어요', 'ok');
}

/* ---------- PNG 이미지 (Canvas) ---------- */
const IMG = {
  paper: '#F6F4EF', surface: '#FFFFFF', ink: '#1A1A1A', ink2: '#55524C', line: '#E3DFD7',
  primary: '#1F5FA8', ok: '#2E9E48', bad: '#D9382C', warn: '#E0A400', idle: '#8A867E',
};
const stColor = (s) => ({ ok: IMG.ok, part: IMG.warn, bad: IMG.bad, idle: IMG.idle }[s] || IMG.idle);

function makeCanvas(w, h) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'middle';
  return { cv, ctx, w, h };
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function saveCanvas(cv, filename) {
  cv.toBlob((blob) => { download(filename, blob); toast('이미지를 내려받았어요', 'ok'); }, 'image/png');
}

// 표 이미지 렌더 (title, subtitle, 컬럼 정의, 행들)
function renderTableImage({ title, subtitle, columns, rows, footer }) {
  const W = 900;
  const pad = 40, headerH = 130, rowH = 64, colGap = 0;
  const H = headerH + 56 + rows.length * rowH + (footer ? rowH : 0) + pad + 60;
  const { cv, ctx } = makeCanvas(W, H);

  // 배경
  ctx.fillStyle = IMG.paper; ctx.fillRect(0, 0, W, H);
  // 헤더
  ctx.fillStyle = IMG.primary; ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = '#fff';
  ctx.font = '800 40px "Malgun Gothic", sans-serif';
  ctx.fillText(title, pad, 54);
  ctx.font = '600 24px "Malgun Gothic", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillText(subtitle || '', pad, 96);

  const tableX = pad, tableW = W - pad * 2;
  let y = headerH + 24;

  // 컬럼 x 위치 계산(가중치)
  const totalWeight = columns.reduce((s, c) => s + c.w, 0);
  const xs = []; let cx = tableX;
  for (const c of columns) { xs.push(cx); cx += (c.w / totalWeight) * tableW; }
  const colX = (i) => xs[i];
  const colW = (i) => (columns[i].w / totalWeight) * tableW;

  // 헤더 행
  ctx.font = '700 22px "Malgun Gothic", sans-serif';
  ctx.fillStyle = IMG.ink2;
  columns.forEach((c, i) => drawCell(ctx, c.label, colX(i), y, colW(i), c.align));
  y += 40;
  ctx.strokeStyle = IMG.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(tableX, y); ctx.lineTo(tableX + tableW, y); ctx.stroke();

  // 데이터 행
  ctx.font = '600 24px "Malgun Gothic", sans-serif';
  for (const row of rows) {
    y += rowH;
    columns.forEach((c, i) => {
      const cell = row[i];
      if (cell && cell.status) {
        // 상태 배지
        const label = cell.label, color = stColor(cell.status);
        ctx.font = '700 22px "Malgun Gothic", sans-serif';
        const tw = ctx.measureText(label).width;
        const bx = c.align === 'right' ? colX(i) + colW(i) - tw - 36 : colX(i);
        roundRectPath(ctx, bx, y - rowH / 2 + 8, tw + 28, 36, 18);
        ctx.fillStyle = color + '22'; ctx.fill();
        ctx.beginPath(); ctx.arc(bx + 14, y - rowH / 2 + 26, 6, 0, 7); ctx.fillStyle = color; ctx.fill();
        ctx.fillStyle = color; ctx.fillText(label, bx + 26, y - rowH / 2 + 26);
        ctx.font = '600 24px "Malgun Gothic", sans-serif';
      } else {
        ctx.fillStyle = IMG.ink;
        drawCell(ctx, String(cell ?? ''), colX(i), y - rowH / 2 + 32 - 12, colW(i), c.align);
      }
    });
    ctx.strokeStyle = IMG.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tableX, y + rowH / 2 - 8); ctx.lineTo(tableX + tableW, y + rowH / 2 - 8); ctx.stroke();
  }

  if (footer) {
    y += rowH;
    ctx.font = '800 26px "Malgun Gothic", sans-serif';
    ctx.fillStyle = IMG.primary;
    columns.forEach((c, i) => drawCell(ctx, String(footer[i] ?? ''), colX(i), y - 6, colW(i), c.align));
  }

  // 워터마크
  ctx.font = '600 20px "Malgun Gothic", sans-serif';
  ctx.fillStyle = IMG.ink2;
  ctx.fillText('건물주 장부 · ' + todayISO(), pad, H - 34);

  return cv;
}
function drawCell(ctx, text, x, y, w, align) {
  const prev = ctx.textAlign;
  if (align === 'right') { ctx.textAlign = 'right'; ctx.fillText(text, x + w - 12, y + 12); }
  else { ctx.textAlign = 'left'; ctx.fillText(text, x, y + 12); }
  ctx.textAlign = prev;
}

export async function exportTenantImage(t) {
  const monthly = await tenantMonthly(t);
  const columns = [
    { label: '월', w: 3, align: 'left' },
    { label: '청구', w: 3, align: 'right' },
    { label: '받음', w: 3, align: 'right' },
    { label: '상태', w: 3, align: 'right' },
  ];
  const rows = monthly.map((r) => [formatMonth(r.month), won(r.due), won(r.paid), { status: r.state, label: STATUS[r.state].label }]);
  const cv = renderTableImage({
    title: `${t.unit}호 ${t.name}`,
    subtitle: `${t.kind === 'shop' ? '상가' : '주택'} · 계약 ${formatMonth(t.contractStart)}부터`,
    columns, rows,
  });
  saveCanvas(cv, `장부_${t.unit}호_${t.name}.png`);
}

export async function exportBuildingImage(buildingId, month = monthKey()) {
  const building = await store.getBuilding(buildingId);
  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');
  const columns = [
    { label: '호실', w: 2, align: 'left' },
    { label: '이름', w: 3, align: 'left' },
    { label: '청구', w: 3, align: 'right' },
    { label: '받음', w: 3, align: 'right' },
    { label: '상태', w: 3, align: 'right' },
  ];
  const rows = []; let sumDue = 0, sumPaid = 0;
  for (const t of tenants) {
    const pays = await store.getPaymentsForTenantMonth(t.id, month);
    const s = store.paymentStatus(t, month, pays);
    sumDue += s.due; sumPaid += s.paid;
    rows.push([t.unit, t.name, won(s.due), won(s.paid), { status: s.state, label: STATUS[s.state].label }]);
  }
  const cv = renderTableImage({
    title: `${building?.name || '건물'} 납부 현황`,
    subtitle: formatMonth(month),
    columns, rows,
    footer: ['합계', '', won(sumDue), won(sumPaid), ''],
  });
  saveCanvas(cv, `장부_${building?.name || '건물'}_${month}.png`);
}
