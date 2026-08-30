// 알림함 — 지금 챙길 일(미납/계약 만료). 문자 발송은 알림 모듈(스텁)을 통해.
import { h, won, formatMonth, toast, confirmSheet } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, emptyState, banner } from '../ui/shell.js';
import * as store from '../store.js';
import { computeAlerts, sendUnpaid, sendExpiry, getChannel } from '../notify/notify.js';
import { navigate } from '../router.js';

export async function renderNotifications() {
  const buildingId = await store.getCurrentBuildingId();
  const alerts = await computeAlerts(buildingId);
  const channelLabel = getChannel().label;

  const sendUnpaidMsg = (a) => {
    if (!a.tenant.phone) return toast('이 세입자의 휴대폰 번호가 없어요. 세입자 수정에서 넣어 주세요.', 'bad');
    confirmSheet({
      title: '미납 안내 문자 보내기',
      desc: `${a.tenant.unit}호 ${a.tenant.name}님(${a.tenant.phone})에게 ${won(a.remaining)}원 미납 안내를 보냅니다.`,
      confirmText: '보내기',
      onConfirm: async () => { await sendUnpaid(a.tenant, a.month, a.remaining); toast('안내를 보냈어요 (' + channelLabel + ')', 'ok'); },
    });
  };
  const sendExpiryMsg = (a) => {
    if (!a.tenant.phone) return toast('이 세입자의 휴대폰 번호가 없어요.', 'bad');
    confirmSheet({
      title: '계약 만료 안내 문자',
      desc: `${a.tenant.unit}호 ${a.tenant.name}님에게 계약 만료 안내를 보냅니다.`,
      confirmText: '보내기',
      onConfirm: async () => { await sendExpiry(a.tenant); toast('안내를 보냈어요 (' + channelLabel + ')', 'ok'); },
    });
  };

  return screen({ plain: true },
    topbar({ title: '알림', sub: '지금 챙길 일', back: '/' }),
    h('div', { class: 'stack-lg' },
      banner('info', { text: `문자 발송은 지금 “${channelLabel}”로 흉내만 내요. 나중에 실제 문자나 카카오 알림톡으로 바꿀 수 있어요.` }),

      alerts.total === 0 && emptyState({ art: 'check', title: '다 챙기셨어요!', desc: '지금은 알림이 없어요.' }),

      alerts.bankReminder && alerts.bankReminder.show && h('div', { class: 'card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          h('span', { class: 'chip chip--warn' }, icon('download', { size: 16 }), '월말 정리'),
          h('div', { class: 'rowcard__main' },
            h('div', { class: 'rowcard__title' }, '은행 파일 받아 정리할 때'),
            h('div', { class: 'rowcard__meta' }, `아직 확인 안 된 세입자 ${alerts.bankReminder.pending}명`))),
        h('button', { class: 'btn btn--primary btn--block mt-4', onClick: () => navigate('/bank-import') }, icon('download'), '은행 파일로 정리'),
      ),

      alerts.unpaid.length > 0 && h('div', {},
        h('div', { class: 'section-title' }, `미납 ${alerts.unpaid.length}건`),
        h('div', { class: 'stack' }, ...alerts.unpaid.map((a) => h('div', { class: 'card' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('span', { class: 'chip chip--bad' }, icon('alert', { size: 16 }), '미납'),
            h('button', { class: 'rowcard__main', style: btnReset(), onClick: () => navigate('/tenant/' + a.tenant.id) },
              h('div', { class: 'rowcard__title' }, `${a.tenant.unit}호 ${a.tenant.name}`),
              h('div', { class: 'rowcard__meta' }, `${formatMonth(a.month)} · 남은 ${won(a.remaining)}원`))),
          h('button', { class: 'btn btn--secondary btn--block mt-4', onClick: () => sendUnpaidMsg(a) }, icon('phone'), '미납 안내 문자 보내기'),
        ))),
      ),

      alerts.expiring.length > 0 && h('div', {},
        h('div', { class: 'section-title' }, `계약 만료 임박 ${alerts.expiring.length}건`),
        h('div', { class: 'stack' }, ...alerts.expiring.map((a) => h('div', { class: 'card' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
            h('span', { class: 'chip chip--warn' }, icon('calendar', { size: 16 }), a.monthsLeft <= 0 ? '이번 달' : `${a.monthsLeft}개월 뒤`),
            h('button', { class: 'rowcard__main', style: btnReset(), onClick: () => navigate('/tenant/' + a.tenant.id) },
              h('div', { class: 'rowcard__title' }, `${a.tenant.unit}호 ${a.tenant.name}`),
              h('div', { class: 'rowcard__meta' }, `만료 ${formatMonth(a.tenant.contractEnd)}`))),
          h('div', { class: 'btn-row mt-4' },
            h('button', { class: 'btn btn--secondary', onClick: () => navigate('/tenant/' + a.tenant.id + '/edit') }, icon('edit'), '재계약(수정)'),
            h('button', { class: 'btn btn--secondary', onClick: () => sendExpiryMsg(a) }, icon('phone'), '안내 문자'),
          ),
        ))),
      ),

      h('button', { class: 'btn btn--ghost btn--lg', onClick: () => navigate('/notify-settings') }, icon('settings'), '알림 설정 바꾸기'),
    ),
  );
}

function btnReset() { return { background: 'none', border: 'none', font: 'inherit', textAlign: 'left', padding: 0, cursor: 'pointer', flex: 1 }; }
