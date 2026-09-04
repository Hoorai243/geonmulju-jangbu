// 세입자 상세 — 정보, 이번 달 상태, 요금 변경, 연체 횟수, 알림 개별설정, 내보내기, 퇴거/삭제.
import { h, won, monthKey, addMonths, formatMonth, formatDate, todayISO, openSheet, confirmSheet, toast, attachAmountFormat, parseNum, clear , unitLabel } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, statusChip, banner } from '../ui/shell.js';
import * as store from '../store.js';
import { navigate } from '../router.js';
import { openConfirmForTenant } from './pay-flow.js';
import { exportTenantExcel, exportTenantImage } from '../export/export.js';
import { requireAuth } from '../ui/authgate.js';
import { coachMark } from '../ui/coach.js';

export async function renderTenantDetail({ params }) {
  const t = await store.getTenant(params.id);
  if (!t) { navigate('/tenants', { replace: true }); return h('div'); }
  const month = monthKey();
  const carry = await store.tenantLedger(t, month);          // 선납 이월 반영
  const st = carry.map.get(month) || { state: 'idle', due: 0, paid: 0, avail: 0, remaining: 0, carried: false };
  const net = carry.net;                                     // +선납 / -밀림
  const rate = store.ratesForMonth(t, month);
  const ledger = await store.getLedger(t.id);
  const dep = store.depositSummary(ledger);
  const late = await store.lateCountCarry(t);
  const defaults = await store.getNotifyDefaults();
  const refresh = () => navigate('/tenant/' + t.id, { replace: true });

  // 최근 6개월 상태
  const mini = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(month, -i);
    mini.push({ m, s: (carry.map.get(m) || { state: 'idle' }).state });
  }

  setTimeout(() => coachMark({
    target: 'coach-months', seenKey: 'pastMonth', title: '지난 달도 여기서',
    text: '각 달 **동그라미를 누르면** 그 달 입금을 기록하거나 되돌려요. 빠뜨린 지난 달을 여기서 채우세요.',
  }), 500);

  return screen({ plain: true },
    topbar({
      title: `${unitLabel(t.unit)}`, sub: t.name, back: '/tenants',
      right: t.status !== 'movedout' && h('button', { class: 'iconbtn', 'aria-label': '수정', onClick: () => navigate('/tenant/' + t.id + '/edit') }, icon('edit')),
    }),
    h('div', { class: 'stack-lg' },

      t.status === 'movedout' && h('div', { class: 'card stack' },
        banner('info', { title: '퇴거한 세입자예요', text: `퇴거일: ${formatDate(t.movedOutAt)}. 실수로 눌렀다면 되돌릴 수 있어요.` }),
        h('button', { class: 'btn btn--secondary btn--block', onClick: async () => { await store.reactivateTenant(t.id); toast('다시 활성으로 되돌렸어요', 'ok'); refresh(); } }, icon('refund'), '퇴거 취소 (다시 활성)')),

      // 기본 정보
      h('div', { class: 'card' },
        h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' } },
          h('span', { class: 'chip chip--info' }, t.kind === 'shop' ? '상가' : '주택'),
          t.businessName && h('span', { class: 'chip chip--idle' }, t.businessName),
          late > 0 && h('span', { class: 'chip chip--bad' }, `지금까지 ${late}번 밀림`),
          net > 0 && h('span', { class: 'chip chip--info' }, `미리 냄 ${won(net)}원`),
          net < 0 && h('span', { class: 'chip chip--bad' }, `밀린 돈 ${won(-net)}원`),
        ),
        h('dl', { class: 'deflist' },
          dt('계약 기간'), dd(`${formatMonth(t.contractStart)} ~ ${t.contractEnd ? formatMonth(t.contractEnd) : '미정'}`),
          ...(t.trackStart ? [dt('장부 시작월'), dd(formatMonth(t.trackStart) + '부터')] : []),
          dt('월세'), dd(won(rate.rent) + '원'),
          dt('관리비'), dd((() => { const f = store.feeConfig(t, month); return `${won(f.amount)}원${f.cycle === 'bimonthly' ? ' · 격월(' + (f.parity === 'even' ? '짝수달' : '홀수달') + ')' : ''}`; })()),
          ...(() => { const w = store.waterConfig(t, month); return w.cycle !== 'none' && w.amount > 0
            ? [dt('수도세'), dd(`${won(w.amount)}원 · ${w.cycle === 'monthly' ? '매월' : '격월(' + (w.parity === 'even' ? '짝수달' : '홀수달') + ')'}`)]
            : []; })(),
          ...(t.vat ? [dt('부가세'), dd(`${won(rate.vat)}원 (10%) · 청구 ${won(rate.total)}원`)] : []),
          dt('납기일'), dd(`매월 ${t.dueDay || 1}일`),
          t.phone ? dt('휴대폰') : null, t.phone ? dd(t.phone) : null,
          t.bizNo ? dt('사업자번호') : null, t.bizNo ? dd(t.bizNo) : null,
        ),
      ),

      // 이번 달 상태
      t.status !== 'movedout' && h('div', { class: 'card' },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('div', { style: { fontWeight: 800, fontSize: 'var(--fs-lg)' } }, `${formatMonth(month)} 상태`),
          statusChip(st.state)),
        h('div', { class: 'mt-4', style: { display: 'flex', justifyContent: 'space-between' } },
          h('span', { class: 'muted' }, '청구'), h('span', { class: 'amount won' }, won(rate.total))),
        st.carried && h('div', { class: 'mt-2', style: { color: 'var(--ok-ink)', fontSize: 'var(--fs-sm)' } }, '지난달 선납으로 채워졌어요'),
        (st.avail > 0 && !st.carried) && h('div', { class: 'mt-2', style: { display: 'flex', justifyContent: 'space-between', color: 'var(--ok-ink)' } },
          h('span', {}, '받음'), h('span', { class: 'amount won' }, won(st.avail))),
        st.remaining > 0 && st.state !== 'idle' && h('div', { class: 'mt-2', style: { display: 'flex', justifyContent: 'space-between', color: 'var(--bad-ink)' } },
          h('span', {}, '남음'), h('span', { class: 'amount won' }, won(st.remaining))),
        h('button', { class: 'btn btn--primary btn--block mt-4', onClick: () => openConfirmForTenant({ tenant: t, month, prefillAmount: st.remaining || rate.total, onDone: refresh }) },
          icon('check'), st.state === 'ok' ? '입금 더 기록' : '입금 확인'),
      ),

      // 최근 6개월 — 각 달을 눌러 그 달 입금을 기록하거나 되돌릴 수 있음
      h('div', {},
        h('div', { class: 'section-title' }, '최근 6개월 (눌러서 기록/되돌리기)'),
        h('div', { id: 'coach-months', style: { display: 'flex', gap: '6px' } }, ...mini.map((x) => h('button', {
          style: { flex: 1, textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', borderRadius: '10px' },
          'aria-label': `${formatMonth(x.m)} 입금 기록`, onClick: () => openMonthSheet(t, x.m, refresh),
        },
          h('div', { class: 'dot dot--' + statusCls(x.s), style: { width: '20px', height: '20px', margin: '0 auto 6px' } }),
          h('div', { class: 'muted', style: { fontSize: '0.8rem' } }, formatMonth(x.m).replace(/^\d+년 /, ''))))),
      ),

      // 요금 변경
      h('div', {},
        h('div', { class: 'section-title' }, '요금 변경 이력'),
        h('div', { class: 'stack' },
          ...[...(t.rentHistory || [])].sort((a, b) => (a.from < b.from ? 1 : -1)).map((hh) => h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('div', { class: 'grow' },
              h('div', { style: { fontWeight: 700 } }, `${formatMonth(hh.from)}부터`),
              h('div', { class: 'muted' }, `월세 ${won(hh.rent)} · 관리비 ${won(hh.fee)}`)),
            (t.rentHistory.length > 1) && h('button', { class: 'iconbtn', 'aria-label': '삭제', onClick: () => confirmSheet({ title: '이 요금 변경을 지울까요?', desc: `${formatMonth(hh.from)}부터의 요금(월세 ${won(hh.rent)}·관리비 ${won(hh.fee)})을 지워요. 그 기간은 이전 요금으로 계산돼요.`, confirmText: '지우기', onConfirm: async () => { await store.deleteRateChange(t.id, hh.from); toast('지웠어요', 'ok'); refresh(); } }) }, icon('trash')),
          )),
          h('button', { class: 'btn btn--secondary btn--block', onClick: () => openRateChange(t, refresh) }, icon('plus'), '요금 변경 등록'),
          banner('info', { text: '요금을 바꿔도, 바꾸기 전 달의 미납은 예전 금액 그대로 계산돼요.' }),
          banner('info', { text: '과거 달부터 세고 싶으면(밀림 포함) 위쪽 “수정”에서 “계약 시작월”을 앞당기세요. 반대로 최근 달만 보려면 “장부 시작월”에 그 달을 넣으면 그 전은 밀림에 안 잡혀요.' }),
        ),
      ),

      // 보증금 요약
      h('button', { class: 'rowcard', onClick: () => navigate('/deposit/' + t.id) },
        h('div', { style: { width: '48px', height: '48px', flex: 'none', borderRadius: '12px', background: 'var(--primary-tint)', color: 'var(--primary-press)', display: 'grid', placeItems: 'center' } }, icon('wallet')),
        h('div', { class: 'rowcard__main' }, h('div', { class: 'rowcard__title' }, '보증금 관리'), h('div', { class: 'rowcard__meta' }, `현재 보관 ${won(dep.held)}원`)),
        h('span', { class: 'rowcard__chev' }, icon('chevRight'))),

      // 알림 개별 설정
      notifyBox(t, defaults, refresh),

      // 내보내기
      h('div', {},
        h('div', { class: 'section-title' }, '내보내기'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn--secondary', onClick: () => exportTenantExcel(t) }, icon('download'), '엑셀'),
          h('button', { class: 'btn btn--secondary', onClick: () => exportTenantImage(t) }, icon('image'), '이미지'),
        )),

      // 위험 동작
      h('div', {},
        h('div', { class: 'section-title' }, '계약 정리'),
        h('div', { class: 'stack' },
          t.status !== 'movedout' && h('button', { class: 'btn btn--secondary btn--block', onClick: () => doMoveOut(t) }, icon('logout'), '퇴거 처리 (보증금 정산)'),
          h('button', { class: 'btn btn--danger btn--block', onClick: () => doDelete(t) }, icon('trash'), '세입자 삭제'),
        )),
      h('div', { style: { height: '12px' } }),
    ),
  );
}

const dt = (x) => h('dt', {}, x);
const dd = (x) => h('dd', {}, x);
function statusCls(s) { return s === 'ok' ? 'ok' : s === 'part' ? 'warn' : s === 'bad' ? 'bad' : 'idle'; }

// 특정 달(지난 달 포함) 입금 보기/기록/되돌리기
async function openMonthSheet(t, m, refresh) {
  const pays = await store.getPaymentsForTenantMonth(t.id, m);
  const rate = store.ratesForMonth(t, m);
  const led = await store.tenantLedger(t, m);
  const st = led.map.get(m) || { state: 'idle', due: rate.total, paid: 0, remaining: rate.total };

  openSheet({
    title: `${formatMonth(m)} 입금`,
    desc: `${unitLabel(t.unit)} ${t.name}`,
    body: (close) => {
      const removePay = (p) => {
        // 되돌리면 이 달이 어떤 상태가 되는지 미리 보여준다
        const due = rate.total;
        const newPaid = Math.max(0, (st.paid || 0) - p.amount);
        const newState = due > 0 && newPaid >= due ? 'ok' : newPaid > 0 ? 'part' : (store.isOverdue(t, m) ? 'bad' : 'idle');
        const label = { ok: '완납', part: '부분납부', bad: '미납', idle: '미확인' }[newState];
        const doDel = async () => { await store.deletePayment(p.id); toast('되돌렸어요', 'ok'); close(); refresh(); };
        confirmSheet({
          title: '이 입금을 되돌릴까요?',
          desc: `${won(p.amount)}원을 지우면 ${formatMonth(m)}이 "${label}"(으)로 바뀌어요.` + (p.source === 'bank' ? ' 은행에서 확인된 입금이에요.' : ''),
          confirmText: '되돌리기',
          onConfirm: doDel,
        });
      };
      const payRow = (p) => h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        h('div', { class: 'grow' },
          h('div', { style: { fontWeight: 800 } }, won(p.amount) + '원'),
          h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `${p.depositorName || '입금'} · ${p.source === 'bank' ? '은행 확인' : '직접 입력'}${p.paidAt ? ' · ' + formatDate(p.paidAt) : ''}`)),
        h('button', { class: 'iconbtn', 'aria-label': '되돌리기', onClick: () => removePay(p) }, icon('trash')),
      );
      return h('div', { class: 'stack' },
        h('div', { class: 'card', style: { background: 'var(--surface-2)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', { class: 'muted' }, '이 달 청구'), h('span', { class: 'amount won' }, won(rate.total))),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '6px', alignItems: 'center' } }, h('span', { class: 'muted' }, '상태'), statusChip(st.state)),
          st.remaining > 0 && st.state !== 'idle' && h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '6px', color: 'var(--bad-ink)' } }, h('span', {}, '남은'), h('span', { class: 'amount won' }, won(st.remaining))),
        ),
        pays.length
          ? h('div', {}, h('div', { class: 'section-title' }, '기록된 입금'), h('div', { class: 'stack' }, ...pays.map(payRow)))
          : banner('info', { text: '아직 이 달 입금 기록이 없어요. 아래 버튼으로 넣으세요.' }),
        h('button', { class: 'btn btn--primary btn--lg', onClick: () => { close(); openConfirmForTenant({ tenant: t, month: m, prefillAmount: st.remaining || rate.total, onDone: refresh }); } }, icon('plus'), '이 달 입금 기록'),
      );
    },
  });
}

function openRateChange(t, refresh) {
  const from = h('input', { class: 'input', type: 'month', value: monthKey() });
  const cur = store.ratesForMonth(t, monthKey());
  const wc = store.waterConfig(t, monthKey());
  // 수도세를 관리비와 다른 주기로 받는 세입자만 쓰는 옵션. 지금은 화면에서 숨김.
  // 이미 수도세가 켜진 세입자라면 끌 수 있게 계속 보여줌.
  const showWater = wc.cycle !== 'none';
  const rent = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', value: cur.rent ? cur.rent.toLocaleString('ko-KR') : '' }));
  const curFee = store.feeConfig(t, monthKey()).amount; // 설정된 원래 관리비(격월 '안 받는 달'이면 ratesForMonth().fee 는 0이라 못 씀)
  const fee = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', value: curFee ? curFee.toLocaleString('ko-KR') : '' }));

  // 관리비 주기
  const feeC = store.feeConfig(t, monthKey());
  let feeCycle = feeC.cycle, feeParity = feeC.parity;
  const fM = h('button', { type: 'button', class: 'choice__opt' }, '매월');
  const fB = h('button', { type: 'button', class: 'choice__opt' }, '격월');
  const fPO = h('button', { type: 'button', class: 'choice__opt' }, '홀수 달');
  const fPE = h('button', { type: 'button', class: 'choice__opt' }, '짝수 달');
  const feeParityRow = h('div', { class: 'choice' }, fPO, fPE);
  const feeParityField = h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '언제'), feeParityRow);
  const frc = () => { fM.classList.toggle('choice__opt--on', feeCycle === 'monthly'); fB.classList.toggle('choice__opt--on', feeCycle === 'bimonthly'); feeParityField.style.display = feeCycle === 'bimonthly' ? 'block' : 'none'; };
  const frp = () => { fPO.classList.toggle('choice__opt--on', feeParity === 'odd'); fPE.classList.toggle('choice__opt--on', feeParity === 'even'); };
  fM.onclick = () => { feeCycle = 'monthly'; frc(); }; fB.onclick = () => { feeCycle = 'bimonthly'; frc(); };
  fPO.onclick = () => { feeParity = 'odd'; frp(); }; fPE.onclick = () => { feeParity = 'even'; frp(); };
  frc(); frp();

  // 수도세
  let waterCycle = wc.cycle === 'none' ? 'monthly' : wc.cycle;
  let waterParity = wc.parity || 'odd';
  const waterAmount = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', value: wc.amount ? wc.amount.toLocaleString('ko-KR') : '' }));
  const waterCb = h('input', { type: 'checkbox', checked: wc.cycle !== 'none' });
  const waterSwitch = h('label', { class: 'switch' }, waterCb, h('span', { class: 'switch__track' }));
  const cM = h('button', { type: 'button', class: 'choice__opt' }, '매월');
  const cB = h('button', { type: 'button', class: 'choice__opt' }, '격월');
  const pO = h('button', { type: 'button', class: 'choice__opt' }, '홀수 달');
  const pE = h('button', { type: 'button', class: 'choice__opt' }, '짝수 달');
  const parityRow = h('div', { class: 'choice' }, pO, pE);
  const wDetails = h('div', { class: 'stack', style: { marginTop: '12px' } },
    h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '한 번 낼 수도세'), h('div', { class: 'input-suffix' }, waterAmount, h('span', { class: 'suffix' }, '원'))),
    h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '주기'), h('div', { class: 'choice' }, cM, cB)),
    h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '언제'), parityRow),
  );
  const rc = () => { cM.classList.toggle('choice__opt--on', waterCycle === 'monthly'); cB.classList.toggle('choice__opt--on', waterCycle === 'bimonthly'); parityRow.parentElement.style.display = waterCycle === 'bimonthly' ? 'block' : 'none'; };
  const rp = () => { pO.classList.toggle('choice__opt--on', waterParity === 'odd'); pE.classList.toggle('choice__opt--on', waterParity === 'even'); };
  const rw = () => { wDetails.style.display = waterCb.checked ? 'block' : 'none'; rc(); rp(); };
  cM.onclick = () => { waterCycle = 'monthly'; rc(); }; cB.onclick = () => { waterCycle = 'bimonthly'; rc(); };
  pO.onclick = () => { waterParity = 'odd'; rp(); }; pE.onclick = () => { waterParity = 'even'; rp(); };
  waterCb.onchange = rw; rw();

  openSheet({
    title: '요금 변경', desc: '언제부터 얼마로 바꿀지 정해요.',
    body: (close) => h('div', { class: 'stack' },
      h('div', { class: 'field', id: 'coach-rate', style: { margin: 0 } }, h('label', { class: 'label' }, '적용 시작월'), from),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '새 월세'), h('div', { class: 'input-suffix' }, rent, h('span', { class: 'suffix' }, '원'))),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '새 관리비'), h('div', { class: 'input-suffix' }, fee, h('span', { class: 'suffix' }, '원'))),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '관리비 주기'), h('div', { class: 'choice' }, fM, fB)),
      feeParityField,
      showWater && h('div', { class: 'card' },
        h('div', { class: 'settingrow', style: { padding: 0 } },
          h('div', { class: 'settingrow__main' }, h('div', { class: 'settingrow__title' }, '수도세 따로 받기')),
          waterSwitch),
        wDetails),
      h('button', {
        class: 'btn btn--primary btn--lg', onClick: async () => {
          await store.changeRates(t.id, {
            from: from.value, rent: parseNum(rent.value), fee: parseNum(fee.value), feeCycle, feeParity,
            water: waterCb.checked ? parseNum(waterAmount.value) : 0,
            waterCycle: waterCb.checked ? waterCycle : 'none', waterParity,
          });
          close(); toast('요금을 바꿨어요', 'ok'); refresh();
        },
      }, '저장'),
    ),
  });
  setTimeout(() => coachMark({
    target: 'coach-rate', seenKey: 'rateChange', title: '적용 시작월이 중요해요',
    text: '**적용 시작월**부터 새 요금이 적용돼요. 그 전 밀린 달은 **옛 금액 그대로**예요.',
  }), 350);
}

function notifyBox(t, defaults, refresh) {
  const val = t.notifyOverride === true ? 'on' : t.notifyOverride === false ? 'off' : 'default';
  const sel = h('select', { class: 'select' },
    h('option', { value: 'default', selected: val === 'default' }, `전체 설정 따름 (현재 ${defaults.enabled ? '켜짐' : '꺼짐'})`),
    h('option', { value: 'on', selected: val === 'on' }, '이 세입자는 항상 알림 켜기'),
    h('option', { value: 'off', selected: val === 'off' }, '이 세입자는 알림 끄기'),
  );
  sel.onchange = async () => {
    const v = sel.value === 'on' ? true : sel.value === 'off' ? false : null;
    await store.setNotifyOverride(t.id, v);
    toast('알림 설정을 저장했어요', 'ok');
  };
  return h('div', {},
    h('div', { class: 'section-title' }, '이 세입자 알림'),
    h('div', { class: 'card' }, sel));
}

function doMoveOut(t) {
  confirmSheet({
    title: '퇴거 처리할까요?', desc: '퇴거 처리하면 보증금 정산 화면으로 이동해요. 기록은 사라지지 않아요.',
    confirmText: '퇴거 처리', onConfirm: async () => { await store.moveOutTenant(t.id); toast('퇴거 처리했어요'); navigate('/deposit/' + t.id); },
  });
}
function doDelete(t) {
  // 삭제 전에: 기록을 먼저 내보내거나, 퇴거로 유도. 그 다음에만 지문/비번 확인.
  openSheet({
    title: `${unitLabel(t.unit)} ${t.name} 삭제`,
    desc: '삭제하면 이 세입자의 모든 입금·보증금 기록이 사라지고 되돌릴 수 없어요. 기록을 남기려면 먼저 내보내세요. (떠난 세입자는 삭제 말고 “퇴거 처리”를 쓰면 기록이 남아요.)',
    body: (close) => h('div', { class: 'stack' },
      h('button', { class: 'btn btn--secondary btn--lg', onClick: () => exportTenantExcel(t) }, icon('download'), '먼저 거래내역 내보내기 (엑셀)'),
      h('div', { class: 'btn-row', style: { marginTop: '4px' } },
        h('button', { class: 'btn btn--secondary', onClick: close }, '취소'),
        h('button', { class: 'btn btn--danger', onClick: () => { close(); confirmDelete(t); } }, icon('trash'), '그래도 삭제')),
    ),
  });
}
function confirmDelete(t) {
  requireAuth({
    title: `${unitLabel(t.unit)} ${t.name} 삭제`,
    desc: '정말 삭제할까요? 모든 기록이 지워지고 되돌릴 수 없어요. 지문이나 비밀번호로 확인해 주세요.',
    confirmText: '삭제', onConfirm: async () => { await store.deleteTenant(t.id); toast('삭제했어요'); navigate('/tenants', { replace: true }); },
  });
}
