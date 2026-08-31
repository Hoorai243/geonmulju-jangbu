// 앱 시작점 — 저장소 열기, 서비스워커 등록, 로그인 관문, 화면 주소 연결.
import { openDB } from './db.js';
import { route, setNotFound, setBeforeEach, startRouter, navigate } from './router.js';
import * as auth from './auth/auth.js';
import * as store from './store.js';
import { isNative, ensureMonthEndReminder, cancelMonthEndReminder, wireNotificationTap } from './notify/native.js';
import { startAutoLock } from './auth/autolock.js';

import { renderOnboarding } from './screens/onboarding.js';
import { renderLogin } from './screens/login.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderTenants } from './screens/tenants.js';
import { renderTenantForm } from './screens/tenant-form.js';
import { renderTenantDetail } from './screens/tenant-detail.js';
import { renderDepositList, renderDepositDetail } from './screens/deposit.js';
import { renderHistory } from './screens/history.js';
import { renderNotifications } from './screens/notifications.js';
import { renderMore, renderAccounts, renderSecurity, renderNotifySettings, renderMatchRules, renderLeftTenants } from './screens/more.js';
import { renderQuickPay } from './screens/quick-pay.js'; // ⚠️ 임시 수기 도우미
import { renderBankImport } from './screens/bank-import.js';
import { renderBankGuide } from './screens/bank-guide.js';
import { renderTax } from './screens/tax.js';
import { renderHelp } from './screens/help.js';

async function boot() {
  await openDB();

  // 서비스워커(오프라인) — 보안 컨텍스트에서만. 네이티브 앱에선 필요 없어 건너뜀.
  if (!isNative() && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 등록 실패', e));
  }

  // 네이티브(안드로이드 앱): 월말 정리 알림을 설정에 맞춰 예약/해제 + 알림 탭 연결
  // 알림 쪽에서 문제가 생겨도 앱 시작 자체는 절대 막지 않도록 감싼다.
  if (isNative()) {
    try {
      wireNotificationTap(navigate);
      const nd = await store.getNotifyDefaults();
      if (nd.enabled && nd.bankReminder !== false) ensureMonthEndReminder({ day: nd.bankReminderDay || 25 });
      else cancelMonthEndReminder();
    } catch (e) {
      console.warn('알림 설정 중 문제(무시하고 계속)', e);
    }
  }

  // 로그인 관문
  setBeforeEach(async (path) => {
    const hasAcc = await auth.hasAccount();
    if (!hasAcc) return path.startsWith('/onboarding') ? null : '/onboarding';
    if (!auth.isUnlocked()) return path.startsWith('/login') ? null : '/login';
    if (path.startsWith('/login') || path.startsWith('/onboarding')) return '/';
    return null;
  });

  // 라우트
  route('/onboarding', renderOnboarding);
  route('/login', renderLogin);
  route('/', renderDashboard);
  route('/tenants', renderTenants);
  route('/tenant/new', renderTenantForm);
  route('/tenant/:id', renderTenantDetail);
  route('/tenant/:id/edit', renderTenantForm);
  route('/quick-pay', renderQuickPay); // ⚠️ 임시 수기 도우미(자동연동 시 제거 후보)
  route('/bank-import', renderBankImport);
  route('/bank-guide', renderBankGuide);
  route('/tax', renderTax);
  route('/help', renderHelp);
  route('/deposit', renderDepositList);
  route('/deposit/:id', renderDepositDetail);
  route('/history', renderHistory);
  route('/notifications', renderNotifications);
  route('/more', renderMore);
  route('/accounts', renderAccounts);
  route('/security', renderSecurity);
  route('/notify-settings', renderNotifySettings);
  route('/match-rules', renderMatchRules);
  route('/left-tenants', renderLeftTenants);
  setNotFound(renderDashboard);

  startRouter();
  startAutoLock();
}

// 전역 노출(개발/디버그 편의)
window.__jangbu = { store, auth };

boot();
