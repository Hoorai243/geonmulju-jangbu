// 자동 잠금 — 앱을 벗어나면(백그라운드) 바로 잠그고, 일정 시간 안 만지면 잠근다.
// 그리고 "나갔다 다시 돌아오면" 지문을 자동으로 요청한다(편의).
// (앱을 처음 켤 때는 자동으로 안 띄운다 — 그때는 WebView 준비 전이라 인식돼도 씹히기 때문.)
import * as auth from './auth.js';
import { navigate } from '../router.js';

const IDLE_MS = 5 * 60 * 1000; // 5분 동안 안 만지면 잠금
let idleTimer = null;
let wasBackgrounded = false; // 백그라운드로 나간 적이 있는지(돌아올 때 자동 지문용)
let authInProgress = false;

function lockNow(fromBackground) {
  if (auth.isUnlocked()) {
    auth.lock();
    navigate('/login', { replace: true });
  }
  if (fromBackground) wasBackgrounded = true;
}
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => lockNow(false), IDLE_MS);
}

// 앱으로 돌아왔을 때: 백그라운드 갔던 경우에만 지문 자동 요청
async function onResume() {
  if (!wasBackgrounded || authInProgress) return;
  wasBackgrounded = false;
  if (auth.isUnlocked()) return; // 이미 열려 있으면 그대로
  authInProgress = true;
  try {
    if ((await auth.hasBiometric()) && (await auth.biometricAvailable())) {
      await auth.loginBiometric();       // 성공하면 unlock 됨
      navigate('/', { replace: true });
    }
  } catch (e) {
    // 실패·취소 → 로그인 화면 그대로(버튼/비밀번호로 열면 됨)
  } finally {
    authInProgress = false;
  }
}

export function startAutoLock() {
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) lockNow(true); else onResume(); });
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  if (cap && cap.Plugins && cap.Plugins.App) {
    try {
      cap.Plugins.App.addListener('appStateChange', (s) => { if (!s || !s.isActive) lockNow(true); else onResume(); });
    } catch (e) { /* 무시 */ }
  }
  resetIdle();
}
