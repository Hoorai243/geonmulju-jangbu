// 자동 잠금 + 지문 자동 요청.
// - 앱을 벗어나면(백그라운드) 바로 잠그고, 5분 안 만지면 잠근다.
// - 앱이 준비되면(처음 열 때) 그리고 다시 돌아올 때, 잠겨 있으면 지문을 자동으로 요청한다.
import * as auth from './auth.js';
import { navigate } from '../router.js';

const IDLE_MS = 5 * 60 * 1000; // 5분 동안 안 만지면 잠금
const COLD_START_MS = 900;     // 처음 열 때: 앱이 준비될 시간을 준 뒤 지문 요청(너무 일찍 뜨면 씹힘)
let idleTimer = null;
let authInProgress = false;

function lockNow() {
  if (auth.isUnlocked()) { auth.lock(); navigate('/login', { replace: true }); }
}
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lockNow, IDLE_MS);
}

// 지문으로 자동 로그인 시도. 반환: 'ok' | 'fail' | 'busy' | 'unavailable'
// 처음 열 때(콜드 스타트)와 돌아올 때, 그리고 로그인 화면의 지문 버튼이 모두 이 함수를 쓴다(중복 방지).
export async function attemptBiometricLogin() {
  if (authInProgress || auth.isUnlocked()) return 'busy';
  authInProgress = true;
  try {
    if (!(await auth.hasBiometric()) || !(await auth.biometricAvailable())) return 'unavailable';
    await auth.loginBiometric();          // 성공하면 unlock 됨
    navigate('/', { replace: true });
    return 'ok';
  } catch (e) {
    return 'fail';                         // 취소·실패 → 로그인 화면 그대로
  } finally {
    authInProgress = false;
  }
}

export function startAutoLock() {
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
  // 화면을 벗어나면 즉시 잠금 / 돌아오면 지문 자동 요청
  document.addEventListener('visibilitychange', () => { if (document.hidden) lockNow(); else attemptBiometricLogin(); });
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  if (cap && cap.Plugins && cap.Plugins.App) {
    try {
      cap.Plugins.App.addListener('appStateChange', (s) => { if (!s || !s.isActive) lockNow(); else attemptBiometricLogin(); });
    } catch (e) { /* 무시 */ }
  }
  resetIdle();
  // 처음 열 때: 앱이 준비된 뒤 지문 자동 요청(로그인 화면이면)
  setTimeout(() => attemptBiometricLogin(), COLD_START_MS);
}
