// 입금 확인 공통 흐름 — (A) 입금자명으로 찾기, (B) 세입자 지정 후 금액 확인.
import { h, won, parseNum, attachAmountFormat, todayISO, formatMonth, toast, openSheet, clear } from '../util.js';
import { icon } from '../icons.js';
import { statusChip } from '../ui/shell.js';
import * as store from '../store.js';
import { matchDepositor } from '../matching.js';

// (B) 특정 세입자의 이번 달 입금을 확인/보정하는 시트
export async function openConfirmForTenant({ tenant, month, depositorName = '', prefillAmount = null, onDone }) {
  const pays = await store.getPaymentsForTenantMonth(tenant.id, month);
  const { total: due } = store.ratesForMonth(tenant, month);
  const already = pays.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, due - already);
  const defaultAmt = prefillAmount != null ? prefillAmount : (remaining || due);

  const amount = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', value: defaultAmt ? defaultAmt.toLocaleString('ko-KR') : '' }));
  const depositor = h('input', { class: 'input', value: depositorName || tenant.name, placeholder: '통장에 찍힌 입금자명' });
  const date = h('input', { class: 'input', type: 'date', value: todayISO() });
  const diffLine = h('div', { class: 'muted', style: { marginTop: '6px', fontSize: 'var(--fs-sm)' } });
  const preview = h('div', { style: { marginTop: '8px' } });

  const rentInfo = store.ratesForMonth(tenant, month);

  function update() {
    const amt = parseNum(amount.value);
    const newPaid = already + amt;
    // 차액 안내(청구액 기준)
    if (amt !== remaining && remaining > 0) {
      const d = amt - remaining;
      diffLine.textContent = d > 0
        ? `청구 잔액보다 ${won(d)}원 많아요.`
        : `청구 잔액보다 ${won(-d)}원 적어요. (부분납부로 기록돼요)`;
    } else diffLine.textContent = '';
    const st = newPaid >= due ? 'ok' : newPaid > 0 ? 'part' : 'idle';
    clear(preview).appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      '기록 후 상태:', statusChip(st),
      st === 'part' ? h('span', { class: 'muted' }, `남은 ${won(Math.max(0, due - newPaid))}원`) : null,
    ));
  }
  amount.addEventListener('input', update);

  openSheet({
    title: `${tenant.unit}호 ${tenant.name} · 입금 확인`,
    desc: `${formatMonth(month)}`,
    body: (close) => {
      update();
      return h('div', { class: 'stack' },
        h('div', { class: 'card', style: { background: 'var(--surface-2)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { class: 'muted' }, '월세'), h('span', { class: 'amount won' }, won(rentInfo.rent))),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '6px' } }, h('span', { class: 'muted' }, '관리비'), h('span', { class: 'amount won' }, won(rentInfo.fee))),
          rentInfo.water > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '6px' } }, h('span', { class: 'muted' }, '수도세'), h('span', { class: 'amount won' }, won(rentInfo.water))),
          rentInfo.vat > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '6px' } }, h('span', { class: 'muted' }, '부가세 (10%)'), h('span', { class: 'amount won' }, won(rentInfo.vat))),
          h('hr', { class: 'hr', style: { margin: '10px 0' } }),
          h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('strong', {}, '이번 달 청구'), h('strong', { class: 'amount won' }, won(due))),
          already > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '6px', color: 'var(--ok-ink)' } }, h('span', {}, '이미 받음'), h('span', { class: 'amount won' }, won(already))),
        ),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '이번에 받은 금액'), h('div', { class: 'input-suffix' }, amount, h('span', { class: 'suffix' }, '원')), diffLine, preview),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '입금자명'), depositor),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '입금일'), date),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn--secondary', onClick: close }, '취소'),
          h('button', {
            class: 'btn btn--primary', onClick: async () => {
              const amt = parseNum(amount.value);
              if (amt <= 0) return toast('받은 금액을 입력해 주세요.', 'bad');
              await store.addPayment({ buildingId: tenant.buildingId, tenantId: tenant.id, month, amount: amt, depositorName: depositor.value, paidAt: date.value, source: 'manual' });
              close(); toast('입금을 기록했어요', 'ok'); onDone && onDone();
            },
          }, icon('check'), '확인 완료'),
        ),
      );
    },
  });
}

// (A) 입금자명으로 세입자 찾기
export async function openNameMatch({ buildingId, month, onDone }) {
  const tenants = await store.getTenants(buildingId);
  const name = h('input', { class: 'input', placeholder: '예: 홍길동', autofocus: true });
  const amount = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', placeholder: '0 (선택)' }));
  const result = h('div', { style: { marginTop: '12px' } });

  const search = () => {
    const q = name.value.trim();
    clear(result);
    if (!q) return;
    const { suggestion, candidates } = matchDepositor(q, tenants);
    const amt = parseNum(amount.value) || null;

    if (suggestion) {
      const t = suggestion.tenant;
      result.appendChild(h('div', { class: 'banner banner--info' }, icon('info'),
        h('div', {}, h('strong', {}, '이 분이 맞나요?'), `${t.unit}호 ${t.name}${t.businessName ? ' (' + t.businessName + ')' : ''}`)));
      result.appendChild(h('button', { class: 'btn btn--primary btn--lg mt-4', onClick: () => pick(t) }, icon('check'), `${t.unit}호 ${t.name}님으로 확인`));
      result.appendChild(h('div', { class: 'center muted', style: { margin: '10px 0' } }, '다른 사람인가요? 아래에서 고르세요'));
    }
    // 후보/전체 선택 드롭다운
    const sel = h('select', { class: 'select' },
      h('option', { value: '' }, '세입자 직접 선택…'),
      ...candidates.filter((c) => !suggestion || c.tenant.id !== suggestion.tenant.id)
        .map((c) => h('option', { value: c.tenant.id }, `${c.tenant.unit}호 ${c.tenant.name}${c.tenant.businessName ? ' (' + c.tenant.businessName + ')' : ''}`)));
    sel.onchange = () => { const t = tenants.find((x) => x.id === sel.value); if (t) pick(t); };
    result.appendChild(sel);
    result.appendChild(h('button', { class: 'btn btn--ghost btn--lg mt-4', onClick: saveUnmatched }, icon('receipt'), '누군지 몰라 “미확인 입금”으로 저장'));

    function pick(t) {
      closeThis();
      openConfirmForTenant({ tenant: t, month, depositorName: q, prefillAmount: amt, onDone });
    }
    async function saveUnmatched() {
      await store.addPayment({ buildingId, tenantId: null, month, amount: amt || 0, depositorName: q, source: 'manual' });
      closeThis(); toast('미확인 입금으로 저장했어요', 'ok'); onDone && onDone();
    }
  };
  name.addEventListener('input', search);
  amount.addEventListener('input', search);

  let closeThis;
  const ctrl = openSheet({
    title: '입금 확인',
    desc: '통장에 찍힌 입금자명을 적으면 세입자를 찾아드려요.',
    body: () => h('div', { class: 'stack' },
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '입금자명'), name),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, h('span', {}, '입금액 '), h('span', { class: 'optional' }, '(선택)')), h('div', { class: 'input-suffix' }, amount, h('span', { class: 'suffix' }, '원'))),
      result,
    ),
  });
  closeThis = ctrl.close;
  setTimeout(() => name.focus(), 100);
}
