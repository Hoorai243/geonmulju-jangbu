// 자동 잠금 + 지문 자동 요청.
// - 앱을 벗어나면(백그라운드) 잠그고, 5분 안 만지면 잠근다.
// - 앱이 준비되면(처음 열 때)과 돌아올 때, 잠겨 있으면 지문을 자동으로 요청한다.
// - 단, 파일 선택창·공유·문자·확인지문처럼 "앱이 스스로 잠깐 벗어나는" 경우엔 잠그지 않는다.
import * as auth from './auth.js';
import { navigate } from '../router.js';

const IDLE_MS = 5 * 60 * 1000; // 5분 동안 안 만지면 잠금
const COLD_START_MS = 900;     // 처음 열 때: 앱이 준비될 시간을 준 뒤 지문 요청
let idleTimer = null;
let authInProgress = false;
let skipBg = false; // 다음 백그라운드는 잠그지 않음(파일 선택 등 내부 동작)

// 파일 선택·공유·문자·확인지문 등 앱이 스스로 다른 화면을 열기 직전에 부른다.
export function ignoreNextBackground() {
  skipBg = true;
  setTimeout(() => { skipBg = false; }, 60000); // 안전장치: 60초 내 복귀 없으면 해제
}

function lockNow() {
  if (auth.isUnlocked()) { auth.lock(); navigate('/login', { replace: true }); }
}
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lockNow, IDLE_MS);
}

function onBackground() { if (skipBg) return; lockNow(); }
function onForeground() { if (skipBg) { skipBg = false; return; } attemptBiometricLogin(); }

// 지문으로 자동 로그인 시도. 반환: 'ok' | 'fail' | 'busy' | 'unavailable'
export async function attemptBiometricLogin() {
  if (authInProgress || auth.isUnlocked()) return 'busy';
  authInProgress = true;
  try {
    if (!(await auth.hasBiometric()) || !(await auth.biometricAvailable())) return 'unavailable';
    ignoreNextBackground(); // 지문창이 앱을 잠깐 벗어나게 해도 잠그지 않게
    await auth.loginBiometric();
    navigate('/', { replace: true });
    return 'ok';
  } catch (e) {
    return 'fail';
  } finally {
    authInProgress = false;
  }
}

export function startAutoLock() {
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBackground(); else onForeground(); });
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  if (cap && cap.Plugins && cap.Plugins.App) {
    try {
      cap.Plugins.App.addListener('appStateChange', (s) => { if (!s || !s.isActive) onBackground(); else onForeground(); });
    } catch (e) { /* 무시 */ }
  }
  resetIdle();
  setTimeout(() => attemptBiometricLogin(), COLD_START_MS);
}
