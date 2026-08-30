// ⚠️ 임시(수기 입력 도우미) — "한 번에 확인" 화면.
// 손으로 빠르게 완납 처리하려는 기능. 나중에 오픈뱅킹 자동연동이 되면 제거 후보.
// [제거 방법] 이 파일 삭제 + app.js 의 '/quick-pay' 라우트/임포트 제거
//            + dashboard.js 의 "한 번에 확인" 버튼 제거.
import { h, won, monthKey, addMonths, formatMonth, toast } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, emptyState, banner, statusChip } from '../ui/shell.js';
import * as store from '../store.js';
import { navigate } from '../router.js';

export async function renderQuickPay({ query } = { query: {} }) {
  const buildingId = await store.getCurrentBuildingId();
  const month = query.m || monthKey();
  const lastMonth = addMonths(month, -1);
  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');

  // 아직 완납 아닌 세입자만 대상
  const rows = [];
  for (const t of tenants) {
    const pays = await store.getPaymentsForTenantMonth(t.id, month);
    const st = store.paymentStatus(t, month, pays);
    if (st.state === 'ok' || st.due <= 0) continue;
    const lastPays = await store.getPaymentsForTenantMonth(t.id, lastMonth);
    const paidLast = store.paymentStatus(t, lastMonth, lastPays).state === 'ok';
    rows.push({ tenant: t, st, paidLast });
  }

  if (rows.length === 0) {
    return screen({ plain: true },
      topbar({ title: '한 번에 확인', back: '/?m=' + month }),
      emptyState({ art: 'check', title: '더 확인할 게 없어요', desc: `${formatMonth(month)}은 모두 완납이에요.` }),
    );
  }

  const selected = new Set();
  const footerCount = h('span', {}, '0명 선택');
  const footerBtn = h('button', { class: 'btn btn--primary', disabled: true, onClick: apply },
    icon('check'), h('span', {}, '완납 처리'));

  function updateFooter() {
    footerCount.textContent = `${selected.size}명 선택`;
    footerBtn.disabled = selected.size === 0;
  }

  const rowEls = rows.map(({ tenant, st, paidLast }) => {
    const box = h('span', { class: 'paycheck' }, icon('check'));
    const el = h('button', {
      class: 'rowcard', 'aria-pressed': 'false',
      onClick: () => {
        if (selected.has(tenant.id)) { selected.delete(tenant.id); box.className = 'paycheck'; el.setAttribute('aria-pressed', 'false'); el.style.borderColor = 'var(--line)'; }
        else { selected.add(tenant.id); box.className = 'paycheck paycheck--on'; el.setAttribute('aria-pressed', 'true'); el.style.borderColor = 'var(--ok-solid)'; }
        updateFooter();
      },
    },
      box,
      h('div', { class: 'rowcard__main' },
        h('div', { class: 'rowcard__title' }, `${tenant.unit}호 ${tenant.name}`),
        h('div', { class: 'rowcard__meta' }, `받을 금액 ${won(st.remaining)}원`, paidLast && ' · 지난달 완납')),
      h('div', { class: 'rowcard__right' }, statusChip(st.state)),
    );
    return { tenant, el, box, paidLast };
  });

  function selectAll(only) {
    selected.clear();
    for (const r of rowEls) {
      const pick = only === 'last' ? r.paidLast : true;
      if (pick) { selected.add(r.tenant.id); r.box.className = 'paycheck paycheck--on'; r.el.style.borderColor = 'var(--ok-solid)'; r.el.setAttribute('aria-pressed', 'true'); }
      else { r.box.className = 'paycheck'; r.el.style.borderColor = 'var(--line)'; r.el.setAttribute('aria-pressed', 'false'); }
    }
    updateFooter();
  }

  async function apply() {
    const list = rows.filter((r) => selected.has(r.tenant.id));
    for (const { tenant, st } of list) {
      await store.addPayment({ buildingId, tenantId: tenant.id, month, amount: st.remaining, depositorName: tenant.name, source: 'manual', note: '한 번에 확인' });
    }
    toast(`${list.length}명 완납 처리했어요`, 'ok');
    navigate('/?m=' + month);
  }

  const hasLast = rowEls.some((r) => r.paidLast);

  return screen({ plain: true },
    topbar({ title: '한 번에 확인', sub: formatMonth(month), back: '/?m=' + month }),
    h('div', { class: 'stack', style: { paddingBottom: '96px' } },
      banner('info', { text: '받은 사람을 눌러서 고르고, 아래 버튼으로 한꺼번에 완납 처리해요. (통장 내역과 대조하며 사용하세요)' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn--secondary', onClick: () => selectAll('all') }, '전체 선택'),
        hasLast && h('button', { class: 'btn btn--secondary', onClick: () => selectAll('last') }, '지난달 낸 사람'),
        h('button', { class: 'btn btn--ghost', onClick: () => selectAll('none') }, '선택 해제'),
      ),
      h('div', { class: 'stack' }, ...rowEls.map((r) => r.el)),
    ),
    // 하단 고정 실행 바
    h('div', { style: { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, background: 'var(--surface)', borderTop: '1px solid var(--line)', boxShadow: 'var(--shadow-up)', padding: '12px 20px calc(12px + env(safe-area-inset-bottom, 0px))' } },
      h('div', { style: { maxWidth: 'var(--maxw)', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px' } },
        h('div', { style: { fontWeight: 700 } }, footerCount),
        h('div', { class: 'grow' }),
        footerBtn,
      )),
  );
}
