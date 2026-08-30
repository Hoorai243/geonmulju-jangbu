// 위험한 동작(삭제 등) 전에 지문/생체 또는 비밀번호로 한 번 더 확인.
import { openSheet, h, toast } from '../util.js';
import { icon } from '../icons.js';
import * as auth from '../auth/auth.js';

// requireAuth({ title, desc, confirmText, onConfirm })
export async function requireAuth({ title = '확인이 필요해요', desc = '되돌릴 수 없는 동작이에요. 지문이나 비밀번호로 확인해 주세요.', confirmText = '확인', onConfirm } = {}) {
  const bioOk = (await auth.hasBiometric()) && (await auth.biometricAvailable());

  openSheet({
    title, desc,
    body: (close) => {
      const pw = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '비밀번호', autocomplete: 'current-password' });
      const err = h('div', { class: 'banner banner--bad', style: { display: 'none' } }, icon('alert'), h('div', {}, '비밀번호가 맞지 않아요.'));

      const ok = () => { close(); onConfirm && onConfirm(); };
      const doBio = async () => {
        try { await auth.loginBiometric(); ok(); }
        catch (e) { toast(e.message || '지문·생체 확인에 실패했어요.', 'bad'); }
      };
      const doPw = async () => {
        if (await auth.verifyPassword(pw.value)) ok();
        else { err.style.display = 'flex'; pw.value = ''; pw.focus(); }
      };
      pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') doPw(); });

      return h('div', { class: 'stack' },
        bioOk && h('button', { class: 'btn btn--danger btn--lg', onClick: doBio }, icon('fingerprint'), '지문·생체로 확인하고 ' + confirmText),
        bioOk && h('div', { class: 'center muted', style: { fontSize: 'var(--fs-sm)' } }, '또는 비밀번호'),
        h('div', { class: 'field', style: { margin: 0 } }, pw),
        err,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn--secondary', onClick: close }, '취소'),
          h('button', { class: 'btn btn--danger', onClick: doPw }, confirmText)),
      );
    },
  });
}
