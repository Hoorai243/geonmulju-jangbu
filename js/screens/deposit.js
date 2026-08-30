// 보증금 — 세입자별 입금/차감/환불을 이벤트로 기록. 퇴거 시 최종 정산 자동 계산.
import { h, won, formatDate, todayISO, openSheet, confirmSheet, toast, attachAmountFormat, parseNum } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, emptyState, banner } from '../ui/shell.js';
import * as store from '../store.js';
import { navigate } from '../router.js';
import { coachMark } from '../ui/coach.js';

/* ---------- 목록 ---------- */
export async function renderDepositList() {
  const buildingId = await store.getCurrentBuildingId();
  const tenants = await store.getTenants(buildingId);
  const active = tenants.filter((t) => t.status !== 'movedout');
  const gone = tenants.filter((t) => t.status === 'movedout');

  async function row(t) {
    const led = await store.getLedger(t.id);
    const s = store.depositSummary(led);
    return h('button', { class: 'rowcard', onClick: () => navigate('/deposit/' + t.id) },
      h('div', { style: { width: '48px', height: '48px', flex: 'none', borderRadius: '12px', background: 'var(--primary-tint)', color: 'var(--primary-press)', display: 'grid', placeItems: 'center' } }, icon('wallet')),
      h('div', { class: 'rowcard__main' },
        h('div', { class: 'rowcard__title' }, `${t.unit}호 ${t.name}`),
        h('div', { class: 'rowcard__meta' }, `계약 보증금 ${won(t.deposit)}원`)),
      h('div', { class: 'rowcard__right' },
        h('div', { class: 'muted', style: { fontSize: '0.8rem' } }, '현재 보관'),
        h('div', { class: 'amount won', style: { fontWeight: 800 } }, won(s.held))),
    );
  }

  return screen({ tab: '/deposit' },
    topbar({ title: '보증금' }),
    active.length === 0
      ? emptyState({ art: 'wallet', title: '세입자를 먼저 등록해요', desc: '세입자를 등록하면 보증금을 관리할 수 있어요.', action: h('button', { class: 'btn btn--primary btn--lg', onClick: () => navigate('/tenants') }, '세입자 등록하러 가기') })
      : h('div', { class: 'stack' }, ...await Promise.all(active.map(row))),
    gone.length > 0 && h('div', {},
      h('div', { class: 'section-title' }, '퇴거한 세입자'),
      h('div', { class: 'stack' }, ...await Promise.all(gone.map(row)))),
  );
}

/* ---------- 상세 ---------- */
export async function renderDepositDetail({ params }) {
  const t = await store.getTenant(params.id);
  if (!t) { navigate('/deposit', { replace: true }); return h('div'); }
  const led = await store.getLedger(t.id);
  const s = store.depositSummary(led);
  const accounts = await store.getAccounts(t.buildingId);
  const acctName = (id) => { const a = accounts.find((x) => x.id === id); return a ? (a.bankName + (a.alias ? ' · ' + a.alias : '')) : ''; };
  const refresh = () => navigate('/deposit/' + t.id, { replace: true });
  const movedout = t.status === 'movedout';

  const typeInfo = {
    in: { label: '입금', cls: 'ok', sign: '+', color: 'var(--ok-ink)', icon: 'plus' },
    deduct: { label: '차감', cls: 'bad', sign: '−', color: 'var(--bad-ink)', icon: 'minus' },
    refund: { label: '환불', cls: 'info', sign: '−', color: 'var(--primary-press)', icon: 'refund' },
  };

  setTimeout(() => coachMark({
    target: 'coach-deposit', seenKey: 'deposit', title: '보증금은 기록으로 남겨요',
    text: '보증금은 금액 하나가 아니라, 입금·차감·환불을 각각 기록해요. 이 버튼들로 기록해두면 퇴거할 때 돌려줄 금액이 자동으로 계산돼요.',
  }), 450);

  return screen({ plain: true },
    topbar({ title: `${t.unit}호 보증금`, sub: t.name, back: '/deposit' }),
    h('div', { class: 'stack-lg' },

      // 요약 카드
      h('div', { class: 'card' },
        h('dl', { class: 'deflist' },
          dt('계약 보증금'), dd(won(t.deposit) + '원'),
          dt('받은 보증금'), dd(won(s.received) + '원'),
          dt('차감 합계'), dd(h('span', { style: { color: 'var(--bad-ink)' } }, won(s.deducted) + '원')),
          s.refunded > 0 ? dt('환불함') : null, s.refunded > 0 ? dd(won(s.refunded) + '원') : null,
        ),
        h('hr', { class: 'hr' }),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
          h('strong', { style: { fontSize: 'var(--fs-lg)' } }, '현재 보관 중'),
          h('strong', { class: 'amount won amount--big' }, won(s.held))),
      ),

      // 퇴거 정산
      movedout && h('div', { class: 'card', style: { borderColor: 'var(--primary)', borderWidth: '2px' } },
        h('div', { style: { fontWeight: 800, fontSize: 'var(--fs-lg)', marginBottom: '8px' } }, '퇴거 최종 정산'),
        h('dl', { class: 'deflist' },
          dt('받은 보증금'), dd(won(s.received) + '원'),
          dt('차감 합계'), dd(h('span', { style: { color: 'var(--bad-ink)' } }, '− ' + won(s.deducted) + '원')),
        ),
        h('hr', { class: 'hr' }),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
          h('strong', {}, '돌려줄 금액'),
          h('strong', { class: 'amount won amount--big', style: { color: 'var(--primary)' } }, won(s.refundable))),
        s.refundable > s.refunded && h('button', { class: 'btn btn--primary btn--block mt-4', onClick: () => openEvent(t, 'refund', refresh, s.refundable - s.refunded, accounts) }, icon('refund'), `${won(s.refundable - s.refunded)}원 환불 기록`),
      ),

      // 이벤트 추가 버튼
      h('div', { class: 'btn-row', id: 'coach-deposit' },
        h('button', { class: 'btn btn--secondary', onClick: () => openEvent(t, 'in', refresh, null, accounts) }, icon('plus'), '입금'),
        h('button', { class: 'btn btn--secondary', onClick: () => openEvent(t, 'deduct', refresh, null, accounts) }, icon('minus'), '차감'),
        h('button', { class: 'btn btn--secondary', onClick: () => openEvent(t, 'refund', refresh, null, accounts) }, icon('refund'), '환불'),
      ),

      // 이벤트 내역
      h('div', {},
        h('div', { class: 'section-title' }, '보증금 내역'),
        led.length === 0
          ? banner('info', { text: '아직 기록이 없어요. 위 버튼으로 보증금 입금부터 기록해 보세요.' })
          : h('div', { class: 'stack' }, ...[...led].reverse().map((l) => {
            const ti = typeInfo[l.type];
            return h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
              h('span', { class: `chip chip--${ti.cls}` }, ti.label),
              h('div', { class: 'rowcard__main' },
                h('div', { style: { color: ti.color, fontWeight: 800, fontSize: 'var(--fs-lg)' } }, `${ti.sign} ${won(l.amount)}원`),
                h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `${formatDate(l.date)}${l.category ? ' · ' + l.category : ''}${l.accountId ? ' · ' + acctName(l.accountId) : ''}${l.memo ? ' · ' + l.memo : ''}`)),
              h('button', { class: 'iconbtn', 'aria-label': '삭제', onClick: async () => { await store.deleteLedger(l.id); toast('삭제했어요'); refresh(); } }, icon('trash')),
            );
          })),
      ),
      h('div', { style: { height: '12px' } }),
    ),
  );
}

const dt = (x) => h('dt', {}, x);
const dd = (x) => h('dd', {}, x);

// 보증금 이벤트 추가 시트
function openEvent(t, type, refresh, prefill, accounts = []) {
  const titles = { in: '보증금 입금 기록', deduct: '보증금 차감 기록', refund: '보증금 환불 기록' };
  const amount = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', value: prefill ? prefill.toLocaleString('ko-KR') : '', placeholder: '0' }));
  const date = h('input', { class: 'input', type: 'date', value: todayISO() });
  // 받은/보낸 계좌 (입금·환불만, 계좌가 있을 때)
  let accountId = '';
  const acctWrap = h('div');
  if ((type === 'in' || type === 'refund') && accounts.length) {
    const sel = h('select', { class: 'select' }, h('option', { value: '' }, '계좌 선택 안 함'),
      ...accounts.map((a) => h('option', { value: a.id }, `${a.bankName}${a.alias ? ' · ' + a.alias : ''}`)));
    sel.onchange = () => { accountId = sel.value; };
    acctWrap.appendChild(h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, type === 'in' ? '받은 계좌' : '보낸 계좌'), sel));
  }
  const catWrap = h('div');
  let category = '';
  if (type === 'deduct') {
    const cats = ['수리비', '밀린 월세', '청소비', '기타'];
    const chips = cats.map((c) => h('button', { type: 'button', class: 'choice__opt', style: { minHeight: '48px' } }, c));
    const setCat = (c, btn) => { category = c; chips.forEach((b) => b.classList.remove('choice__opt--on')); btn.classList.add('choice__opt--on'); };
    chips.forEach((b, i) => (b.onclick = () => setCat(cats[i], b)));
    catWrap.appendChild(h('div', { class: 'field', style: { margin: 0 } },
      h('label', { class: 'label' }, '차감 항목'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, ...chips)));
  }
  const memo = h('input', { class: 'input', placeholder: type === 'deduct' ? '예: 벽지 교체' : '메모 (선택)' });

  openSheet({
    title: titles[type],
    body: (close) => h('div', { class: 'stack' },
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '금액'), h('div', { class: 'input-suffix' }, amount, h('span', { class: 'suffix' }, '원'))),
      catWrap,
      acctWrap,
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '날짜'), date),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, type === 'deduct' ? '내용' : '메모'), memo),
      h('button', {
        class: 'btn btn--primary btn--lg', onClick: async () => {
          const amt = parseNum(amount.value);
          if (amt <= 0) return toast('금액을 입력해 주세요.', 'bad');
          await store.addLedger({ tenantId: t.id, type, amount: amt, category, memo: memo.value, date: date.value, accountId });
          close(); toast('기록했어요', 'ok'); refresh();
        },
      }, icon('check'), '기록하기'),
    ),
  });
}
