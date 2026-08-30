// 로그인 — 열면 바로 지문·생체 시도, 아래 "비밀번호로 입력"으로 전환.
import { h, toast } from '../util.js';
import { icon } from '../icons.js';
import { screen } from '../ui/shell.js';
import * as auth from '../auth/auth.js';
import { navigate } from '../router.js';

export async function renderLogin() {
  const hasBio = await auth.hasBiometric();
  const bioOk = hasBio && await auth.biometricAvailable();

  const pw = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '비밀번호 입력', autocomplete: 'current-password', 'aria-label': '비밀번호' });
  const err = h('div', { class: 'banner banner--bad', style: { display: 'none' } }, icon('alert'), h('div', {}, '비밀번호가 맞지 않아요. 다시 입력해 주세요.'));

  const doPassword = async () => {
    if (await auth.verifyPassword(pw.value)) { auth.unlock(); navigate('/', { replace: true }); }
    else { err.style.display = 'flex'; pw.value = ''; pw.focus(); }
  };
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') doPassword(); });

  const doBio = async (auto) => {
    try { await auth.loginBiometric(); navigate('/', { replace: true }); }
    catch (e) { if (!auto) toast(e.message || '지문·생체 확인에 실패했어요.', 'bad'); }
  };

  // 비밀번호 영역: 생체가 있으면 처음엔 숨김
  const pwSection = h('div', { class: 'stack', style: { display: bioOk ? 'none' : 'block' } },
    h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', { class: 'label' }, '비밀번호'), pw),
    err,
    h('button', { class: 'btn btn--secondary btn--lg', onClick: doPassword }, icon('lock'), '비밀번호로 열기'),
  );
  const showPw = () => { pwSection.style.display = 'block'; setTimeout(() => pw.focus(), 50); };

  // 열면 바로 생체 시도(자동). 브라우저가 막으면 조용히 버튼만 남김.
  if (bioOk) setTimeout(() => doBio(true), 350);

  return screen({ plain: true },
    h('div', { class: 'brand' },
      h('img', { class: 'brand__logo', src: 'icons/icon-192.png', alt: '' }),
      h('div', { class: 'brand__name' }, '건물주 장부'),
      h('div', { class: 'brand__tag' }, '오늘도 편안하게 확인하세요'),
    ),
    h('div', { class: 'stack' },
      bioOk && h('button', { class: 'btn btn--primary btn--lg', onClick: () => doBio(false) }, icon('fingerprint'), '지문·생체로 열기'),
      bioOk && h('button', { class: 'btn btn--ghost', onClick: showPw }, icon('lock'), '비밀번호로 입력'),
      pwSection,
    ),
  );
}
