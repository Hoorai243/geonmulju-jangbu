// 이번 달 현황판 — 핵심 화면. 상태색 목록 + 입금 확인 + 미확인 입금.
import { h, won, monthKey, formatMonth, addMonths, compareMonth, todayISO, openSheet, toast, clear, append, unitLabel, confirmSheet } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, statusChip, banner, STATUS } from '../ui/shell.js';
import * as store from '../store.js';
import { computeAlerts } from '../notify/notify.js';
import { navigate } from '../router.js';
import { openNameMatch, openConfirmForTenant } from './pay-flow.js';
import { runCoachQueue } from '../ui/coach.js';

export async function renderDashboard({ query } = { query: {} }) {
  const buildingId = await store.getCurrentBuildingId();
  if (!buildingId) return noBuilding();
  const building = await store.getBuilding(buildingId);
  const month = query.m || monthKey();
  const isThisMonth = month === monthKey();

  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');
  const unmatched = (await store.getUnmatched(buildingId)).filter((p) => p.month === month);
  const alerts = await computeAlerts(buildingId);

  // 상태 집계
  const rows = [];
  const counts = { ok: 0, part: 0, bad: 0, idle: 0 };
  for (const t of tenants) {
    const led = await store.tenantLedger(t, month);            // 선납 이월 반영
    const st = led.map.get(month) || { state: 'idle', due: 0, paid: 0, remaining: 0, carried: false };
    counts[st.state]++;
    const pays = await store.getPaymentsForTenantMonth(t.id, month);
    rows.push({ tenant: t, st, pays, net: led.net });
  }

  const refresh = () => navigate('/?m=' + month, { replace: true });

  const bell = h('button', { class: 'iconbtn bell-wrap', 'aria-label': '알림', onClick: () => navigate('/notifications') },
    icon('bell'), alerts.total > 0 && h('span', { class: 'badge' }, String(alerts.total)));

  const monthNav = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 16px' } },
    h('button', { class: 'iconbtn', 'aria-label': '이전 달', onClick: () => navigate('/?m=' + addMonths(month, -1)) }, icon('back')),
    h('div', { class: 'grow center', style: { fontSize: 'var(--fs-lg)', fontWeight: 800 } }, formatMonth(month)),
    h('button', { class: 'iconbtn', 'aria-label': '다음 달', disabled: compareMonth(month, monthKey()) >= 0, onClick: () => navigate('/?m=' + addMonths(month, 1)) }, icon('chevRight')),
  );

  const view = screen({ tab: '/' },
    topbar({ title: '이번 달 현황', sub: building?.name, right: bell }),
    monthNav,

    // 월말 정리 알림 — 은행 파일 받아 정리하라는 안내(닫을 수 있음)
    alerts.bankReminder && alerts.bankReminder.show && h('div', {},
      h('div', { class: 'banner banner--warn' }, icon('download'),
        h('div', {}, h('strong', {}, '이번 달 정리할 때예요. '),
          `아직 확인 안 된 세입자가 ${alerts.bankReminder.pending}명 있어요. 은행 앱에서 거래내역 파일을 받아 입금을 정리하세요.`)),
      h('div', { class: 'btn-row', style: { marginTop: '8px' } },
        h('button', { class: 'btn btn--primary', onClick: () => navigate('/bank-import') }, icon('download'), '은행 파일로 정리'),
        h('button', { class: 'btn btn--ghost', onClick: async () => { await store.dismissBankReminder(month); toast('이번 달은 안 보여드릴게요.', 'ok'); refresh(); } }, '이번 달 안 보기')),
    ),

    // 요약
    tenants.length > 0 && summaryCard(tenants.length, counts),

    // 입금 확인 버튼
    tenants.length > 0 && h('div', { class: 'stack mt-4' },
      h('button', { class: 'btn btn--primary btn--lg', onClick: () => navigate('/bank-import') },
        icon('download'), '은행 파일로 정리'),
      h('button', { class: 'btn btn--secondary btn--lg', onClick: () => openNameMatch({ buildingId, month, onDone: refresh }) },
        icon('search'), '입금 직접 확인'),
      // ⚠️ 임시 수기 도우미 — 오픈뱅킹 자동연동이 되면 제거 후보
      counts.ok < tenants.length && h('button', { class: 'btn btn--secondary btn--lg', onClick: () => navigate('/quick-pay?m=' + month) },
        icon('check'), '한 번에 확인'),
    ),

    // 미확인 입금
    unmatched.length > 0 && h('div', {},
      h('div', { class: 'section-title' }, `미확인 입금 ${unmatched.length}건`),
      h('div', { class: 'stack' }, ...unmatched.map((p, i) => unmatchedCard(p, tenants, refresh, i === 0))),
    ),

    // 세입자 상태 목록
    tenants.length === 0
      ? h('div', { class: 'stack' },
        banner('info', { title: '세입자를 먼저 등록해요', text: '세입자를 등록하면 여기에서 매달 입금을 확인할 수 있어요.' }),
        h('button', { class: 'btn btn--primary btn--lg', onClick: () => navigate('/tenant/new') }, icon('plus'), '세입자 등록하러 가기'))
      : h('div', {},
        h('div', { class: 'section-title' }, '세입자별 상태'),
        h('div', { class: 'stack' }, ...rows.map((r, i) => tenantRow(r, month, refresh, i === 0))),
      ),
  );

  if (tenants.length > 0) {
    setTimeout(() => {
      runCoachQueue([
        {
          target: 'coach-paycheck', seenKey: 'paycheck', title: '여기서 입금을 확인해요',
          text: '이 네모를 누르면 이번 달 입금이 완납(초록)으로 바뀌어요. 잘못 눌렀으면 색칠된 네모를 다시 눌러 입금 내역을 열고, 거기서 휴지통을 누르면 되돌려져요.',
        },
        {
          target: 'coach-status', seenKey: 'statusColors', title: '색과 숫자 뜻',
          text: '초록=완납, 빨강=미납, 노랑=부분납부/미확인이에요. 세입자 줄의 “밀림”은 아직 안 낸 쌓인 금액, “선납”은 미리 더 낸 금액이에요.',
        },
        {
          target: 'coach-unmatched', seenKey: 'unmatched', title: '누구 입금인지 정해요',
          text: '은행 파일에서 이름을 자동으로 못 붙인 입금이에요. 이 칸을 누르면 세입자를 고를 수 있고, 고르면 그 사람 입금으로 처리돼요.',
        },
      ]);
    }, 500);
  }

  return view;
}

function summaryCard(total, c) {
  const paidPct = total ? Math.round((c.ok / total) * 100) : 0;
  return h('div', { class: 'card', id: 'coach-status' },
    h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' } },
      h('div', { style: { fontSize: 'var(--fs-lg)', fontWeight: 700 } }, `전체 ${total}명 중 `, h('span', { style: { color: 'var(--ok-ink)' } }, `완납 ${c.ok}명`)),
      h('div', { class: 'muted' }, `${paidPct}%`),
    ),
    h('div', { style: { height: '14px', background: 'var(--idle-bg)', borderRadius: '999px', overflow: 'hidden', margin: '12px 0' } },
      h('div', { style: { width: paidPct + '%', height: '100%', background: 'var(--ok-solid)', borderRadius: '999px', transition: 'width .3s' } })),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
      c.bad > 0 && h('span', { class: 'chip chip--bad' }, h('span', { class: 'dot dot--bad' }), `미납 ${c.bad}`),
      c.part > 0 && h('span', { class: 'chip chip--warn' }, h('span', { class: 'dot dot--warn' }), `부분 ${c.part}`),
      c.idle > 0 && h('span', { class: 'chip chip--idle' }, h('span', { class: 'dot dot--idle' }), `미확인 ${c.idle}`),
      c.ok > 0 && h('span', { class: 'chip chip--ok' }, h('span', { class: 'dot dot--ok' }), `완납 ${c.ok}`),
    ),
  );
}

function tenantRow({ tenant, st, pays, net }, month, refresh, isFirst) {
  const boxCls = st.state === 'ok' ? 'paycheck paycheck--on'
    : st.state === 'part' ? 'paycheck paycheck--part'
    : st.state === 'bad' ? 'paycheck paycheck--bad' : 'paycheck';
  const box = h('button', { class: boxCls, id: isFirst ? 'coach-paycheck' : null, 'aria-label': '입금 상태', onClick: (e) => { e.stopPropagation(); onBox(); } }, icon('check'));

  function onBox() {
    if (st.state === 'ok' || st.state === 'part') openPaidSheet({ tenant, month, pays, refresh });
    else openConfirmForTenant({ tenant, month, prefillAmount: st.remaining, onDone: refresh });
  }

  return h('div', { class: 'rowcard' },
    box,
    h('button', { class: 'rowcard__main', style: { background: 'none', border: 'none', font: 'inherit', textAlign: 'left', padding: 0, cursor: 'pointer' }, onClick: () => navigate('/tenant/' + tenant.id) },
      h('div', { class: 'rowcard__title' }, `${unitLabel(tenant.unit)} ${tenant.name}`),
      h('div', { class: 'rowcard__meta' },
        st.carried ? '완납 · 지난 선납으로 채움'
          : st.state === 'ok' ? `완납 · ${won(st.paid)}원`
            : st.state === 'part' ? `${won(st.avail || st.paid)}원 받음 · 남은 ${won(st.remaining)}원`
              : `청구 ${won(st.due)}원`),
    ),
    h('div', { class: 'rowcard__right', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' } },
      statusChip(st.state),
      net < 0 ? h('span', { class: 'chip chip--bad', style: { fontSize: '0.78rem', padding: '2px 8px' } }, `밀림 ${won(-net)}`)
        : net > 0 ? h('span', { class: 'chip chip--info', style: { fontSize: '0.78rem', padding: '2px 8px' } }, `선납 ${won(net)}`) : null),
  );
}

// 출처 배지: 은행 확인 / 직접 입력
export function sourceBadge(source) {
  return source === 'bank'
    ? h('span', { class: 'chip chip--info' }, icon('bank', { size: 14 }), '은행 확인')
    : h('span', { class: 'chip chip--idle' }, icon('edit', { size: 14 }), '직접 입력');
}

// 이미 낸 세입자 박스 눌렀을 때: 내역 + 되돌리기 + 추가입금
function openPaidSheet({ tenant, month, pays, refresh }) {
  const payRow = (p, close) => {
    const card = h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px' } });
    const doDelete = async () => { await store.deletePayment(p.id); close(); toast('되돌렸어요'); refresh(); };
    const normal = () => { clear(card); append(card, [
      h('div', { class: 'grow' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          h('span', { class: 'amount won', style: { fontWeight: 800 } }, won(p.amount)), sourceBadge(p.source)),
        h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `${p.depositorName || '입금자 미상'} · ${p.paidAt}`)),
      h('button', { class: 'iconbtn', 'aria-label': '되돌리기', onClick: () => (p.source === 'bank' ? askDelete() : doDelete()) }, icon('trash')),
    ]); };
    const askDelete = () => { clear(card); append(card, [
      h('div', { class: 'grow', style: { fontSize: 'var(--fs-sm)' } }, '은행에서 확인된 기록이에요. 그래도 지울까요?'),
      h('button', { class: 'btn btn--secondary', style: { minHeight: '44px' }, onClick: normal }, '취소'),
      h('button', { class: 'btn btn--danger', style: { minHeight: '44px' }, onClick: doDelete }, '지우기'),
    ]); };
    normal();
    return card;
  };
  openSheet({
    title: `${unitLabel(tenant.unit)} ${tenant.name}`,
    desc: `${formatMonth(month)} 입금 내역`,
    body: (close) => h('div', { class: 'stack' },
      ...pays.map((p) => payRow(p, close)),
      banner('info', { title: '잘못 넣었나요? (되돌리기)', text: '되돌릴 입금 오른쪽의 휴지통을 누르면 돼요. “직접 입력”은 바로, “은행 확인”은 한 번 더 확인 후 지워져요.' }),
      h('button', { class: 'btn btn--secondary btn--lg', onClick: () => { close(); openConfirmForTenant({ tenant, month, onDone: refresh }); } }, icon('plus'), '입금 더 기록'),
    ),
  });
}

function unmatchedCard(p, tenants, refresh, isFirst) {
  const assign = () => openSheet({
    title: '이 입금은 누구인가요?',
    desc: `입금자명: ${p.depositorName || '(없음)'} · ${won(p.amount)}원`,
    body: (close) => {
      const sel = h('select', { class: 'select' },
        h('option', { value: '' }, '세입자 선택…'),
        ...tenants.map((t) => h('option', { value: t.id }, `${unitLabel(t.unit)} ${t.name}`)));
      return h('div', { class: 'stack' },
        sel,
        h('button', {
          class: 'btn btn--primary btn--lg', onClick: async () => {
            const t = tenants.find((x) => x.id === sel.value);
            if (!t) return toast('세입자를 선택해 주세요.', 'bad');
            await store.updatePayment(p.id, { tenantId: t.id });
            close(); toast('세입자에 연결했어요', 'ok'); refresh();
          },
        }, icon('check'), '이 세입자로 연결'),
        h('button', { class: 'btn btn--ghost', onClick: () => confirmSheet({ title: '이 입금을 지울까요?', desc: `입금자명 ${p.depositorName || '(없음)'} · ${won(p.amount)}원 기록을 지워요. 세입자에 연결하지 않고 지우면 이 입금은 사라져요.`, confirmText: '지우기', danger: true, onConfirm: async () => { await store.deletePayment(p.id); close(); toast('지웠어요', 'ok'); refresh(); } }) }, icon('trash'), '이 입금 삭제'),
      );
    },
  });
  return h('button', { class: 'rowcard', id: isFirst ? 'coach-unmatched' : null, style: { borderColor: 'var(--warn-solid)' }, onClick: assign },
    h('div', { style: { width: '40px', height: '40px', flex: 'none', borderRadius: '10px', background: 'var(--warn-bg)', color: 'var(--warn-ink)', display: 'grid', placeItems: 'center' } }, icon('receipt')),
    h('div', { class: 'rowcard__main' },
      h('div', { class: 'rowcard__title' }, p.depositorName || '입금자 미상'),
      h('div', { class: 'rowcard__meta' }, `${won(p.amount)}원 · 눌러서 세입자 연결`)),
    h('span', { class: 'rowcard__chev' }, icon('chevRight')),
  );
}

function noBuilding() {
  return screen({ plain: true },
    banner('info', { title: '건물이 없어요', text: '앱을 다시 시작해 건물을 등록해 주세요.' }));
}
