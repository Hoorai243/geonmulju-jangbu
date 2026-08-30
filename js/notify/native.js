// 네이티브(안드로이드 앱)에서만 동작 — 월말 "정리하세요" 로컬 알림을 예약한다.
// 앱이 꺼져 있어도 안드로이드가 정한 시각에 울린다(서버 불필요).
// 웹 브라우저에서는 window.Capacitor 가 없어서 전부 아무 동작 없이 넘어간다.

const REMINDER_ID = 1001; // 고정 id — 다시 예약하면 기존 걸 덮어씀

function cap() { return typeof window !== 'undefined' ? window.Capacitor : undefined; }
export function isNative() { const c = cap(); return !!(c && c.isNativePlatform && c.isNativePlatform()); }
function LN() { const c = cap(); return c && c.Plugins && c.Plugins.LocalNotifications; }

// 월말 알림 켜기 — 매달 day 일 hour 시에 반복.
export async function ensureMonthEndReminder({ day = 25, hour = 10 } = {}) {
  if (!isNative()) return { ok: false, reason: 'web' };
  const ln = LN();
  if (!ln) return { ok: false, reason: 'no-plugin' };
  try {
    let perm = await ln.checkPermissions();
    if (perm.display !== 'granted') perm = await ln.requestPermissions();
    if (perm.display !== 'granted') return { ok: false, reason: 'denied' };
    await ln.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => {});
    await ln.schedule({
      notifications: [{
        id: REMINDER_ID,
        title: '건물주 장부',
        body: '이번 달 정리할 때예요. 은행 앱에서 거래내역을 받아 입금을 확인하세요.',
        schedule: { on: { day, hour, minute: 0 }, allowWhileIdle: true },
        extra: { route: '/bank-import' },
      }],
    });
    return { ok: true };
  } catch (e) {
    console.warn('월말 알림 예약 실패', e);
    return { ok: false, reason: 'error', error: String(e) };
  }
}

export async function cancelMonthEndReminder() {
  const ln = LN();
  if (!ln) return;
  await ln.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => {});
}

// 알림을 눌러서 앱에 들어오면 은행 정리 화면으로 보냄.
export function wireNotificationTap(navigate) {
  const ln = LN();
  if (!ln) return;
  // addListener 는 promise 가 아니라 핸들을 돌려줄 수 있어서 .catch 를 붙이면 안 됨.
  try {
    ln.addListener('localNotificationActionPerformed', (e) => {
      const route = e && e.notification && e.notification.extra && e.notification.extra.route;
      if (route) navigate(route);
    });
  } catch (err) {
    console.warn('알림 탭 연결 실패', err);
  }
}
