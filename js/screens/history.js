// 지난 이력 — 세입자별 밀린 횟수 + 최근 6개월 상태. 특정 달 상세는 “현황” 탭에서 달을 넘겨 확인.
import { h, monthKey, addMonths, formatMonth } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, emptyState, banner } from '../ui/shell.js';
import * as store from '../store.js';
import { navigate } from '../router.js';

export async function renderHistory() {
  const buildingId = await store.getCurrentBuildingId();
  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');
  const month = monthKey();

  const items = [];
  for (const t of tenants) {
    const late = await store.lateCount(t);
    const mini = [];
    for (let i = 5; i >= 0; i--) {
      const m = addMonths(month, -i);
      const mp = await store.getPaymentsForTenantMonth(t.id, m);
      mini.push({ m, s: store.paymentStatus(t, m, mp).state });
    }
    items.push({ t, late, mini });
  }
  items.sort((a, b) => b.late - a.late);

  return screen({ tab: '/more' },
    topbar({ title: '지난 이력', sub: '세입자별 밀린 횟수', back: '/more' }),
    banner('info', { text: '특정 달을 자세히 보려면 “현황” 화면에서 위쪽의 ◀ ▶ 로 달을 넘기면 돼요.' }),
    tenants.length === 0
      ? emptyState({ art: 'history', title: '아직 이력이 없어요', desc: '세입자를 등록하고 입금을 확인하면 이력이 쌓여요.' })
      : h('div', { class: 'stack mt-4' }, ...items.map(({ t, late, mini }) =>
        h('button', { class: 'rowcard', style: { flexDirection: 'column', alignItems: 'stretch', gap: '10px' }, onClick: () => navigate('/tenant/' + t.id) },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('div', { class: 'rowcard__main' },
              h('div', { class: 'rowcard__title' }, `${t.unit}호 ${t.name}`),
              h('div', { class: 'rowcard__meta' }, late > 0 ? `지금까지 ${late}번 밀렸어요` : '밀린 적 없어요')),
            late > 0
              ? h('span', { class: 'chip chip--bad' }, `${late}번`)
              : h('span', { class: 'chip chip--ok' }, '깨끗'),
          ),
          h('div', { style: { display: 'flex', gap: '6px' } }, ...mini.map((x) => h('div', { style: { flex: 1, textAlign: 'center' } },
            h('div', { class: 'dot dot--' + cls(x.s), style: { width: '18px', height: '18px', margin: '0 auto 4px' } }),
            h('div', { class: 'muted', style: { fontSize: '0.72rem' } }, formatMonth(x.m).replace(/^\d+년 /, ''))))),
        ))),
  );
}
function cls(s) { return s === 'ok' ? 'ok' : s === 'part' ? 'warn' : s === 'bad' ? 'bad' : 'idle'; }
