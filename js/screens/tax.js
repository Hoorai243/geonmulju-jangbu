// 부가세·세금계산서 정리 — 상가(부가세) 세입자의 공급가액·부가세를 기간별로 뽑아줌.
// 실제 발행·신고는 홈택스/세무사에서. (앱은 계산·정리·리포트)
import { h, won, monthKey, addMonths, formatMonth, parseMonth } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, banner, emptyState } from '../ui/shell.js';
import * as store from '../store.js';
import { navigate } from '../router.js';
import { exportTaxExcel } from '../export/export.js';

function monthsForPeriod(p) {
  const now = monthKey();
  const { y } = parseMonth(now);
  if (p === 'last') return { months: [addMonths(now, -1)], label: formatMonth(addMonths(now, -1)) };
  if (p === 'h1') return { months: Array.from({ length: 6 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`), label: `${y}년 상반기(1~6월)` };
  if (p === 'h2') return { months: Array.from({ length: 6 }, (_, i) => `${y}-${String(i + 7).padStart(2, '0')}`), label: `${y}년 하반기(7~12월)` };
  return { months: [now], label: formatMonth(now) };
}

export async function renderTax({ query } = { query: {} }) {
  const buildingId = await store.getCurrentBuildingId();
  const p = query.p || 'this';
  const { months, label } = monthsForPeriod(p);
  const { rows, totals } = await store.taxSummary(buildingId, months);

  const periodBtn = (key, text) => h('button', {
    class: 'choice__opt' + (p === key ? ' choice__opt--on' : ''), style: { minHeight: '48px' },
    onClick: () => navigate('/tax?p=' + key),
  }, text);

  return screen({ plain: true },
    topbar({ title: '부가세 · 세금계산서', back: '/more' }),
    h('div', { class: 'stack-lg' },
      banner('info', { text: '상가 세입자 중 “부가세 받기”를 켠 곳만 계산해요. 실제 세금계산서 발행·부가세 신고는 홈택스나 세무사에서 하세요.' }),

      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
        periodBtn('this', '이번 달'), periodBtn('last', '지난 달'),
        periodBtn('h1', '상반기'), periodBtn('h2', '하반기')),
      h('div', { class: 'center', style: { fontWeight: 700, fontSize: 'var(--fs-lg)' } }, label),

      rows.length === 0
        ? emptyState({ art: 'receipt', title: '해당하는 상가 세입자가 없어요', desc: '세입자 수정 화면에서 상가 세입자의 “부가세 받기”를 켜면 여기에 나와요.' })
        : h('div', {},
          h('div', { class: 'card', style: { overflowX: 'auto' } },
            h('table', { class: 'table' },
              h('thead', {}, h('tr', {},
                h('th', {}, '세입자'), h('th', { class: 'num' }, '공급가액'), h('th', { class: 'num' }, '부가세'), h('th', { class: 'num' }, '합계'))),
              h('tbody', {},
                ...rows.map((r) => h('tr', {},
                  h('td', {},
                    h('div', { style: { fontWeight: 700 } }, `${r.tenant.unit}호 ${r.tenant.name}`),
                    r.tenant.bizNo && h('div', { class: 'muted', style: { fontSize: '0.85rem' } }, r.tenant.bizNo)),
                  h('td', { class: 'num' }, won(r.supply)),
                  h('td', { class: 'num' }, won(r.vat)),
                  h('td', { class: 'num', style: { fontWeight: 700 } }, won(r.total)))),
                h('tr', { style: { borderTop: '2px solid var(--line-strong)' } },
                  h('td', { style: { fontWeight: 800 } }, '합계'),
                  h('td', { class: 'num', style: { fontWeight: 800 } }, won(totals.supply)),
                  h('td', { class: 'num', style: { fontWeight: 800, color: 'var(--primary)' } }, won(totals.vat)),
                  h('td', { class: 'num', style: { fontWeight: 800 } }, won(totals.total)))),
            )),
          h('div', { class: 'banner banner--info', style: { marginTop: '12px' } }, icon('info'),
            h('div', {}, h('strong', {}, '이 기간 받을 부가세 합계: ' + won(totals.vat) + '원'), '이 금액이 나중에 부가세 신고 때 내는 돈이에요(매입 공제 전).')),
          h('button', { class: 'btn btn--secondary btn--lg mt-6', onClick: () => exportTaxExcel(buildingId, months, label) }, icon('download'), '엑셀로 내보내기'),
        ),
      h('div', { style: { height: '12px' } }),
    ),
  );
}
