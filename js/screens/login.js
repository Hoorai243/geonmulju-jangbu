// 로그인 화면 — 지문/생체 먼저, 아니면 백업 비밀번호.
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
    const ok = await auth.verifyPassword(pw.value);
    if (ok) { auth.unlock(); navigate('/', { replace: true }); }
    else { err.style.display = 'flex'; pw.value = ''; pw.focus(); }
  };
  const doBio = async () => {
    try { await auth.loginBiometric(); navigate('/', { replace: true }); }
    catch (e) { toast(e.message || '생체 확인에 실패했어요.', 'bad'); }
  };

  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') doPassword(); });

  return screen({ plain: true },
    h('div', { class: 'brand' },
      h('img', { class: 'brand__logo', src: 'icons/icon-192.png', alt: '' }),
      h('div', { class: 'brand__name' }, '건물주 장부'),
      h('div', { class: 'brand__tag' }, '오늘도 편안하게 확인하세요'),
    ),
    h('div', { class: 'stack' },
      bioOk && h('button', { class: 'btn btn--primary btn--lg', onClick: doBio }, icon('fingerprint'), '지문·생체로 열기'),
      bioOk && h('div', { class: 'center muted', style: { margin: '8px 0' } }, '또는'),
      h('div', { class: 'field', style: { marginBottom: '0' } },
        !bioOk && h('label', { class: 'label' }, '비밀번호'),
        pw,
      ),
      err,
      h('button', { class: 'btn btn--secondary btn--lg', onClick: doPassword }, icon('lock'), '비밀번호로 열기'),
    ),
  );
}
