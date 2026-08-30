// 세입자 상세 — 정보, 이번 달 상태, 요금 변경, 연체 횟수, 알림 개별설정, 내보내기, 퇴거/삭제.
import { h, won, monthKey, addMonths, formatMonth, formatDate, todayISO, openSheet, confirmSheet, toast, attachAmountFormat, parseNum, clear } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, statusChip, banner } from '../ui/shell.js';
import * as store from '../store.js';
import { navigate } from '../router.js';
import { openConfirmForTenant } from './pay-flow.js';
import { exportTenantExcel, exportTenantImage } from '../export/export.js';

export async function renderTenantDetail({ params }) {
  const t = await store.getTenant(params.id);
  if (!t) { navigate('/tenants', { replace: true }); return h('div'); }
  const month = monthKey();
  const pays = await store.getPaymentsForTenantMonth(t.id, month);
  const st = store.paymentStatus(t, month, pays);
  const rate = store.ratesForMonth(t, month);
  const ledger = await store.getLedger(t.id);
  const dep = store.depositSummary(ledger);
  const late = await store.lateCount(t);
  const defaults = await store.getNotifyDefaults();
  const refresh = () => navigate('/tenant/' + t.id, { replace: true });

  // 최근 6개월 상태
  const mini = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(month, -i);
    const mp = await store.getPaymentsForTenantMonth(t.id, m);
    const ms = store.paymentStatus(t, m, mp);
    mini.push({ m, s: ms.state });
  }

  return screen({ plain: true },
    topbar({
      title: `${t.unit}호`, sub: t.name, back: '/tenants',
      right: t.status !== 'movedout' && h('button', { class: 'iconbtn', 'aria-label': '수정', onClick: () => navigate('/tenant/' + t.id + '/edit') }, icon('edit')),
    }),
    h('div', { class: 'stack-lg' },

      t.status === 'movedout' && banner('info', { title: '퇴거한 세입자예요', text: `퇴거일: ${formatDate(t.movedOutAt)}` }),

      // 기본 정보
      h('div', { class: 'card' },
        h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' } },
          h('span', { class: 'chip chip--info' }, t.kind === 'shop' ? '상가' : '주택'),
          t.businessName && h('span', { class: 'chip chip--idle' }, t.businessName),
          late > 0 && h('span', { class: 'chip chip--bad' }, `지금까지 ${late}번 밀림`),
        ),
        h('dl', { class: 'deflist' },
          dt('계약 기간'), dd(`${formatMonth(t.contractStart)} ~ ${t.contractEnd ? formatMonth(t.contractEnd) : '미정'}`),
          dt('월세'), dd(won(rate.rent) + '원'),
          dt('관리비'), dd(won(rate.fee) + '원'),
          ...(() => { const w = store.waterConfig(t, month); return w.cycle !== 'none' && w.amount > 0
            ? [dt('수도세'), dd(`${won(w.amount)}원 · ${w.cycle === 'monthly' ? '매월' : '격월(' + (w.parity === 'even' ? '짝수달' : '홀수달') + ')'}`)]
            : []; })(),
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
        st.paid > 0 && h('div', { class: 'mt-2', style: { display: 'flex', justifyContent: 'space-between', color: 'var(--ok-ink)' } },
          h('span', {}, '받음'), h('span', { class: 'amount won' }, won(st.paid))),
        st.remaining > 0 && st.state !== 'idle' && h('div', { class: 'mt-2', style: { display: 'flex', justifyContent: 'space-between', color: 'var(--bad-ink)' } },
          h('span', {}, '남음'), h('span', { class: 'amount won' }, won(st.remaining))),
        h('button', { class: 'btn btn--primary btn--block mt-4', onClick: () => openConfirmForTenant({ tenant: t, month, prefillAmount: st.remaining || rate.total, onDone: refresh }) },
          icon('check'), st.state === 'ok' ? '입금 더 기록' : '입금 확인'),
      ),

      // 최근 6개월
      h('div', {},
        h('div', { class: 'section-title' }, '최근 6개월'),
        h('div', { style: { display: 'flex', gap: '6px' } }, ...mini.map((x) => h('div', { style: { flex: 1, textAlign: 'center' } },
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
            (t.rentHistory.length > 1) && h('button', { class: 'iconbtn', 'aria-label': '삭제', onClick: async () => { await store.deleteRateChange(t.id, hh.from); toast('삭제했어요'); refresh(); } }, icon('trash')),
          )),
          h('button', { class: 'btn btn--secondary btn--block', onClick: () => openRateChange(t, refresh) }, icon('plus'), '요금 변경 등록'),
          banner('info', { text: '요금을 바꿔도, 바꾸기 전 달의 미납은 예전 금액 그대로 계산돼요.' }),
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

function openRateChange(t, refresh) {
  const from = h('input', { class: 'input', type: 'month', value: monthKey() });
  const cur = store.ratesForMonth(t, monthKey());
  const wc = store.waterConfig(t, monthKey());
  const rent = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', value: cur.rent ? cur.rent.toLocaleString('ko-KR') : '' }));
  const fee = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', value: cur.fee ? cur.fee.toLocaleString('ko-KR') : '' }));

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
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '적용 시작월'), from),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '새 월세'), h('div', { class: 'input-suffix' }, rent, h('span', { class: 'suffix' }, '원'))),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '새 관리비'), h('div', { class: 'input-suffix' }, fee, h('span', { class: 'suffix' }, '원'))),
      h('div', { class: 'card' },
        h('div', { class: 'settingrow', style: { padding: 0 } },
          h('div', { class: 'settingrow__main' }, h('div', { class: 'settingrow__title' }, '수도세 따로 받기')),
          waterSwitch),
        wDetails),
      h('button', {
        class: 'btn btn--primary btn--lg', onClick: async () => {
          await store.changeRates(t.id, {
            from: from.value, rent: parseNum(rent.value), fee: parseNum(fee.value),
            water: waterCb.checked ? parseNum(waterAmount.value) : 0,
            waterCycle: waterCb.checked ? waterCycle : 'none', waterParity,
          });
          close(); toast('요금을 바꿨어요', 'ok'); refresh();
        },
      }, '저장'),
    ),
  });
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
  confirmSheet({
    title: '정말 삭제할까요?', desc: `${t.unit}호 ${t.name}님의 모든 입금·보증금 기록이 함께 지워져요. 되돌릴 수 없어요.`,
    confirmText: '삭제', danger: true, onConfirm: async () => { await store.deleteTenant(t.id); toast('삭제했어요'); navigate('/tenants', { replace: true }); },
  });
}
