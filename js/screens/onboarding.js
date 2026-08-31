// 처음 시작 — 비밀번호 만들기 → 지문/생체(선택) → 건물 등록 → 계좌 등록(선택).
import { h, clear, toast, confirmSheet } from '../util.js';
import { icon } from '../icons.js';
import { banner } from '../ui/shell.js';
import * as auth from '../auth/auth.js';
import * as store from '../store.js';
import { navigate } from '../router.js';

export async function renderOnboarding() {
  const root = h('main', { class: 'screen screen--plain' });
  const state = { step: 0, buildingId: null };
  const steps = [stepWelcome, stepBiometric, stepBuilding, stepAccounts];

  const go = (n) => { state.step = n; draw(); };
  async function draw() {
    clear(root);
    root.appendChild(progress(state.step, steps.length));
    root.appendChild(await steps[state.step]({ state, go }));
    root.firstElementChild && root.classList.add('fade-in');
    window.scrollTo(0, 0);
  }
  await draw();
  return root;
}

function progress(i, total) {
  return h('div', { style: { display: 'flex', gap: '8px', margin: '24px 0 8px' } },
    ...Array.from({ length: total }, (_, k) => h('div', {
      style: { flex: '1', height: '8px', borderRadius: '999px', background: k <= i ? 'var(--primary)' : 'var(--line-strong)' },
    })),
  );
}

/* ---------- 1. 비밀번호 ---------- */
async function stepWelcome({ go }) {
  const pw = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '숫자 4자리 이상 권장', autocomplete: 'new-password' });
  const pw2 = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '한 번 더 입력', autocomplete: 'new-password' });
  const err = h('div', { class: 'banner banner--bad', style: { display: 'none' } }, icon('alert'), h('div', {}));
  const showErr = (m) => { err.style.display = 'flex'; err.lastChild.textContent = m; };

  const next = async () => {
    if (pw.value.length < 4) return showErr('비밀번호는 4자리 이상으로 정해 주세요.');
    if (pw.value !== pw2.value) return showErr('두 번 입력한 비밀번호가 서로 달라요.');
    await auth.setPassword(pw.value);
    auth.unlock();
    toast('비밀번호를 만들었어요', 'ok');
    go(1);
  };

  return h('div', { class: 'stack' },
    h('div', { class: 'brand', style: { paddingBottom: '8px' } },
      h('img', { class: 'brand__logo', src: 'icons/icon-192.png', alt: '' }),
      h('div', { class: 'brand__name' }, '건물주 장부'),
      h('div', { class: 'brand__tag' }, '월세·관리비·보증금을 한눈에'),
    ),
    banner('info', { text: '먼저 나만 아는 비밀번호를 정해요. 이 비밀번호는 앱을 열 때 쓰고, 이 기기 안에만 안전하게 저장돼요.' }),
    h('div', { class: 'field' }, h('label', { class: 'label' }, '비밀번호 만들기'), pw),
    h('div', { class: 'field' }, h('label', { class: 'label' }, '비밀번호 다시 입력'), pw2),
    err,
    h('button', { class: 'btn btn--primary btn--lg', onClick: next }, '다음'),
  );
}

/* ---------- 2. 지문/생체(선택) ---------- */
async function stepBiometric({ go }) {
  const avail = await auth.biometricAvailable();
  const register = async () => {
    try { await auth.registerBiometric(); toast('지문·생체를 등록했어요', 'ok'); go(2); }
    catch (e) { toast(e.message || '등록을 건너뜁니다.', 'bad'); }
  };
  return h('div', { class: 'stack-lg' },
    h('div', { class: 'empty', style: { paddingBottom: '8px' } },
      h('div', { class: 'empty__art', style: { color: 'var(--primary)' } }, icon('fingerprint')),
      h('div', { class: 'empty__title' }, '지문·생체로 더 편하게'),
      h('div', { class: 'empty__desc' }, avail
        ? '등록해두면 다음부터 비밀번호 없이 지문이나 얼굴로 바로 열 수 있어요.'
        : '이 기기에서는 지문·생체를 쓸 수 없어요. 비밀번호로 사용하시면 됩니다.'),
    ),
    avail && h('button', { class: 'btn btn--primary btn--lg', onClick: register }, icon('fingerprint'), '지문·생체 등록하기'),
    h('button', { class: 'btn btn--ghost btn--lg', onClick: () => go(2) }, avail ? '나중에 하기' : '다음'),
  );
}

/* ---------- 3. 건물 등록 ---------- */
async function stepBuilding({ state, go }) {
  const name = h('input', { class: 'input', placeholder: '예: 행복빌딩, 우리상가' });
  const addr = h('input', { class: 'input', placeholder: '예: 서울시 ○○구 ○○로 12' });
  const err = h('div', { class: 'banner banner--bad', style: { display: 'none' } }, icon('alert'), h('div', {}, '건물 이름을 입력해 주세요.'));
  const next = async () => {
    if (!name.value.trim()) { err.style.display = 'flex'; return; }
    const b = await store.saveBuilding({ name: name.value, address: addr.value });
    await store.setCurrentBuildingId(b.id);
    state.buildingId = b.id;
    go(3);
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'section-title' }, '건물 등록'),
    banner('info', { text: '관리할 건물을 하나 등록해요. 나중에 여러 채도 추가할 수 있어요.' }),
    h('div', { class: 'field' }, h('label', { class: 'label' }, '건물 이름'), name),
    h('div', { class: 'field' }, h('label', { class: 'label' }, h('span', {}, '주소 '), h('span', { class: 'optional' }, '(선택)')), addr),
    err,
    h('button', { class: 'btn btn--primary btn--lg', onClick: next }, '다음'),
  );
}

/* ---------- 4. 계좌 등록(선택) ---------- */
async function stepAccounts({ state, go }) {
  const buildingId = state.buildingId || await store.getCurrentBuildingId();
  const listWrap = h('div', { class: 'stack' });
  async function refresh() {
    clear(listWrap);
    const accts = await store.getAccounts(buildingId);
    if (!accts.length) { listWrap.appendChild(h('div', { class: 'muted center', style: { padding: '8px' } }, '아직 등록한 계좌가 없어요.')); return; }
    for (const a of accts) {
      listWrap.appendChild(h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        icon('bank', { cls: '' }),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, a.bankName), a.alias && h('div', { class: 'muted' }, a.alias)),
        h('button', { class: 'iconbtn', 'aria-label': '삭제', onClick: () => confirmSheet({ title: '계좌를 지울까요?', desc: `${a.bankName}${a.alias ? ' · ' + a.alias : ''}`, confirmText: '삭제', danger: true, onConfirm: async () => { await store.deleteAccount(a.id); refresh(); } }) }, icon('trash')),
      ));
    }
  }
  await refresh();

  const bank = h('input', { class: 'input', placeholder: '은행 이름 (예: 국민은행)' });
  const alias = h('input', { class: 'input', placeholder: '계좌 별칭 (예: 월세 받는 통장)' });
  const add = async () => {
    if (!bank.value.trim()) return toast('은행 이름을 입력해 주세요.', 'bad');
    await store.saveAccount({ buildingId, bankName: bank.value, alias: alias.value });
    bank.value = ''; alias.value = ''; refresh(); toast('계좌를 추가했어요', 'ok');
  };
  const finish = () => { toast('준비 끝! 이제 세입자를 등록해 보세요', 'ok'); navigate('/', { replace: true }); };

  return h('div', { class: 'stack' },
    h('div', { class: 'section-title' }, '입금받는 계좌 등록'),
    banner('info', { text: '통장을 보고 입금을 확인할 때 참고할 계좌예요. 계좌번호는 넣지 않아도 되고, 은행 이름과 별칭만 적으면 돼요. (선택)' }),
    listWrap,
    h('div', { class: 'card stack' },
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '은행 이름'), bank),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, h('span', {}, '계좌 별칭 '), h('span', { class: 'optional' }, '(선택)')), alias),
      h('button', { class: 'btn btn--secondary', onClick: add }, icon('plus'), '계좌 추가'),
    ),
    h('button', { class: 'btn btn--primary btn--lg', onClick: finish }, '시작하기'),
  );
}
