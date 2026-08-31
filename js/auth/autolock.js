// 자동 잠금 — 앱을 벗어나면(백그라운드) 바로 잠그고, 일정 시간 안 만지면 잠근다.
// 잠기면 로그인 화면으로 보내 세입자 정보가 안 보이게 한다.
import * as auth from './auth.js';
import { navigate } from '../router.js';

const IDLE_MS = 5 * 60 * 1000; // 5분 동안 안 만지면 잠금
let idleTimer = null;

function lockNow() {
  if (auth.isUnlocked()) {
    auth.lock();
    navigate('/login', { replace: true });
  }
}
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lockNow, IDLE_MS);
}

export function startAutoLock() {
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
  // 화면을 벗어나면(다른 앱으로 전환 등) 즉시 잠금
  document.addEventListener('visibilitychange', () => { if (document.hidden) lockNow(); });
  // 네이티브(안드로이드 앱): 앱이 백그라운드로 가면 즉시 잠금
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  if (cap && cap.Plugins && cap.Plugins.App) {
    try { cap.Plugins.App.addListener('appStateChange', (s) => { if (!s || !s.isActive) lockNow(); }); } catch (e) { /* 무시 */ }
  }
  resetIdle();
}
