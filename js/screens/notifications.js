// 알림함 — 지금 챙길 일(미납/계약 만료/월말 정리/백업). 미납·만료 안내는 폰 문자 앱을 열어 보낸다.
import { h, won, formatMonth, toast, confirmSheet } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, emptyState, banner } from '../ui/shell.js';
import * as store from '../store.js';
import { computeAlerts, openSms, unpaidMessage, expiryMessage } from '../notify/notify.js';
import { backupNow } from '../export/save-file.js';
import { navigate } from '../router.js';

export async function renderNotifications() {
  const buildingId = await store.getCurrentBuildingId();
  const alerts = await computeAlerts(buildingId);

  const sendUnpaidMsg = (a) => {
    if (!a.tenant.phone) return toast('이 세입자의 휴대폰 번호가 없어요. 세입자 수정에서 넣어 주세요.', 'bad');
    confirmSheet({
      title: '미납 안내 문자',
      desc: `${a.tenant.unit}호 ${a.tenant.name}님(${a.tenant.phone})에게 보낼 문자 앱을 엽니다. 내용을 확인하고 직접 “전송”을 눌러 주세요.`,
      confirmText: '문자 앱 열기',
      onConfirm: () => { if (openSms(a.tenant.phone, unpaidMessage(a.tenant, a.month, a.remaining))) toast('문자 앱을 열었어요. 확인 후 전송하세요.', 'ok'); },
    });
  };
  const sendExpiryMsg = (a) => {
    if (!a.tenant.phone) return toast('이 세입자의 휴대폰 번호가 없어요.', 'bad');
    confirmSheet({
      title: '계약 만료 안내 문자',
      desc: `${a.tenant.unit}호 ${a.tenant.name}님에게 보낼 문자 앱을 엽니다. 내용을 확인하고 직접 “전송”을 눌러 주세요.`,
      confirmText: '문자 앱 열기',
      onConfirm: () => { if (openSms(a.tenant.phone, expiryMessage(a.tenant))) toast('문자 앱을 열었어요. 확인 후 전송하세요.', 'ok'); },
    });
  };

  return screen({ plain: true },
    topbar({ title: '알림', sub: '지금 챙길 일', back: '/' }),
    h('div', { class: 'stack-lg' },

      alerts.total === 0 && emptyState({ art: 'check', title: '다 챙기셨어요!', desc: '지금은 알림이 없어요.' }),

      alerts.backupReminder && alerts.backupReminder.show && h('div', { class: 'card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          h('span', { class: 'chip chip--bad' }, icon('alert', { size: 16 }), '백업'),
          h('div', { class: 'rowcard__main' },
            h('div', { class: 'rowcard__title' }, '기록을 백업할 때예요'),
            h('div', { class: 'rowcard__meta' }, alerts.backupReminder.never ? '아직 한 번도 백업 안 했어요. 폰이 고장나면 다 사라져요.' : `마지막 백업이 ${alerts.backupReminder.days}일 전이에요.`))),
        h('button', { class: 'btn btn--primary btn--block mt-4', onClick: async () => { await backupNow(); navigate('/notifications', { replace: true }); } }, icon('download'), '지금 백업하기'),
      ),

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
