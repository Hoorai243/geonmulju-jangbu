// 더보기 — 계좌/알림/보안 설정, 건물 정보, 전체 내보내기, 백업.
import { h, monthKey, openSheet, confirmSheet, toast, clear } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, banner } from '../ui/shell.js';
import * as store from '../store.js';
import * as db from '../db.js';
import * as auth from '../auth/auth.js';
import { navigate } from '../router.js';
import { exportBuildingExcel, exportBuildingImage } from '../export/export.js';

/* ---------- 더보기 메뉴 ---------- */
export async function renderMore() {
  const buildingId = await store.getCurrentBuildingId();
  const building = await store.getBuilding(buildingId);

  const link = (iconName, label, onClick) => h('button', { class: 'linkrow', onClick },
    icon(iconName, { cls: 'lead' }), h('span', {}, label), h('span', { class: 'linkrow__chev' }, icon('chevRight')));

  return screen({ tab: '/more' },
    topbar({ title: '더보기', sub: building?.name }),
    h('div', { class: 'stack-lg' },

      h('div', {},
        h('div', { class: 'section-title' }, '이번 달 전체 내보내기'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn--secondary', onClick: () => exportBuildingExcel(buildingId) }, icon('download'), '엑셀'),
          h('button', { class: 'btn btn--secondary', onClick: () => exportBuildingImage(buildingId) }, icon('image'), '이미지'),
        )),

      h('div', {},
        h('div', { class: 'section-title' }, '관리'),
        h('div', { class: 'linklist' },
          link('download', '은행 파일로 입금 정리', () => navigate('/bank-import')),
          link('info', '거래내역 받는 법 (은행별)', () => navigate('/bank-guide')),
          link('history', '지난 이력 · 밀린 횟수', () => navigate('/history')),
          link('bank', '입금받는 계좌 관리', () => navigate('/accounts')),
          link('building', '건물 정보 수정', () => editBuilding(building)),
          link('bell', '알림 설정', () => navigate('/notify-settings')),
          link('lock', '보안 설정 (비밀번호·지문)', () => navigate('/security')),
        )),

      h('div', {},
        h('div', { class: 'section-title' }, '백업'),
        h('div', { class: 'linklist' },
          link('download', '백업 파일 저장', backup),
          link('history', '백업 파일 불러오기', restore),
        ),
        h('div', { style: { marginTop: 'var(--sp-4)' } },
          banner('info', { text: '이 앱은 이 기기 안에만 저장돼요. 기기를 바꾸거나 지울 때를 대비해 가끔 백업 파일을 저장해 두면 안전해요.' })),
      ),

      h('button', { class: 'btn btn--secondary btn--lg', onClick: () => { auth.lock(); navigate('/login', { replace: true }); } }, icon('lock'), '앱 잠그기'),
      h('div', { class: 'center muted', style: { fontSize: '0.85rem' } }, '건물주 장부 v1.7.0'),
      h('div', { style: { height: '12px' } }),
    ),
  );
}

function editBuilding(building) {
  const name = h('input', { class: 'input', value: building?.name || '' });
  const addr = h('input', { class: 'input', value: building?.address || '' });
  openSheet({
    title: '건물 정보 수정',
    body: (close) => h('div', { class: 'stack' },
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '건물 이름'), name),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '주소'), addr),
      h('button', { class: 'btn btn--primary btn--lg', onClick: async () => { await store.saveBuilding({ id: building.id, name: name.value, address: addr.value }); close(); toast('저장했어요', 'ok'); navigate('/more', { replace: true }); } }, '저장'),
    ),
  });
}

async function backup() {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `건물주장부_백업_${monthKey()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('백업 파일을 저장했어요', 'ok');
}
function restore() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      confirmSheet({
        title: '백업을 불러올까요?', desc: '지금 저장된 내용은 백업 파일 내용으로 덮어써져요.', confirmText: '불러오기', danger: true,
        onConfirm: async () => { await db.importAll(data); toast('불러왔어요', 'ok'); navigate('/', { replace: true }); },
      });
    } catch { toast('백업 파일을 읽을 수 없어요.', 'bad'); }
  };
  document.body.appendChild(input); input.click(); setTimeout(() => input.remove(), 1000);
}

/* ---------- 계좌 관리 ---------- */
export async function renderAccounts() {
  const buildingId = await store.getCurrentBuildingId();
  const wrap = h('div', { class: 'stack' });
  async function refresh() {
    clear(wrap);
    const accts = await store.getAccounts(buildingId);
    if (!accts.length) wrap.appendChild(banner('info', { text: '아직 등록한 계좌가 없어요.' }));
    for (const a of accts) {
      wrap.appendChild(h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        h('div', { style: { width: '44px', height: '44px', flex: 'none', borderRadius: '10px', background: 'var(--primary-tint)', color: 'var(--primary-press)', display: 'grid', placeItems: 'center' } }, icon('bank')),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, a.bankName), a.alias && h('div', { class: 'muted' }, a.alias)),
        h('button', { class: 'iconbtn', 'aria-label': '삭제', onClick: () => confirmSheet({ title: '계좌를 지울까요?', confirmText: '삭제', danger: true, onConfirm: async () => { await store.deleteAccount(a.id); refresh(); } }) }, icon('trash')),
      ));
    }
  }
  await refresh();
  const bank = h('input', { class: 'input', placeholder: '은행 이름 (예: 국민은행)' });
  const alias = h('input', { class: 'input', placeholder: '계좌 별칭 (예: 월세 통장)' });

  return screen({ plain: true },
    topbar({ title: '계좌 관리', back: '/more' }),
    h('div', { class: 'stack-lg' },
      wrap,
      h('div', { class: 'card stack' },
        h('div', { style: { fontWeight: 700 } }, '계좌 추가'),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '은행 이름'), bank),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, h('span', {}, '별칭 '), h('span', { class: 'optional' }, '(선택)')), alias),
        h('button', { class: 'btn btn--primary', onClick: async () => { if (!bank.value.trim()) return toast('은행 이름을 입력해 주세요.', 'bad'); await store.saveAccount({ buildingId, bankName: bank.value, alias: alias.value }); bank.value = ''; alias.value = ''; refresh(); toast('추가했어요', 'ok'); } }, icon('plus'), '추가'),
      ),
      banner('info', { text: '계좌번호는 넣지 않아도 돼요. 통장 확인할 때 참고용이에요.' }),
    ),
  );
}

/* ---------- 보안 설정 ---------- */
export async function renderSecurity() {
  const hasBio = await auth.hasBiometric();
  const bioAvail = await auth.biometricAvailable();

  const changePw = () => {
    const oldPw = h('input', { class: 'input', type: 'password', placeholder: '지금 비밀번호' });
    const n1 = h('input', { class: 'input', type: 'password', placeholder: '새 비밀번호 (4자리 이상)' });
    const n2 = h('input', { class: 'input', type: 'password', placeholder: '새 비밀번호 다시' });
    openSheet({
      title: '비밀번호 바꾸기',
      body: (close) => h('div', { class: 'stack' },
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '지금 비밀번호'), oldPw),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '새 비밀번호'), n1),
        h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '새 비밀번호 확인'), n2),
        h('button', { class: 'btn btn--primary btn--lg', onClick: async () => {
          if (n1.value.length < 4) return toast('새 비밀번호는 4자리 이상으로.', 'bad');
          if (n1.value !== n2.value) return toast('새 비밀번호가 서로 달라요.', 'bad');
          const ok = await auth.changePassword(oldPw.value, n1.value);
          if (!ok) return toast('지금 비밀번호가 맞지 않아요.', 'bad');
          close(); toast('비밀번호를 바꿨어요', 'ok');
        } }, '바꾸기'),
      ),
    });
  };

  const regBio = async () => {
    try { await auth.registerBiometric(); toast('지문·생체를 등록했어요', 'ok'); navigate('/security', { replace: true }); }
    catch (e) { toast(e.message || '등록에 실패했어요.', 'bad'); }
  };
  const rmBio = () => confirmSheet({ title: '지문·생체를 끌까요?', desc: '앞으로는 비밀번호로만 열려요.', confirmText: '끄기', onConfirm: async () => { await auth.removeBiometric(); toast('껐어요'); navigate('/security', { replace: true }); } });

  return screen({ plain: true },
    topbar({ title: '보안 설정', back: '/more' }),
    h('div', { class: 'stack-lg' },
      h('div', {},
        h('div', { class: 'section-title' }, '비밀번호'),
        h('button', { class: 'btn btn--secondary btn--lg', onClick: changePw }, icon('key'), '비밀번호 바꾸기'),
      ),
      h('div', {},
        h('div', { class: 'section-title' }, '지문·생체'),
        !bioAvail ? banner('info', { text: '이 기기에서는 지문·생체를 쓸 수 없어요.' })
          : hasBio
            ? h('div', { class: 'stack' }, banner('info', { title: '지문·생체가 켜져 있어요', text: '앱을 열 때 지문이나 얼굴로 바로 열 수 있어요.' }), h('button', { class: 'btn btn--secondary btn--lg', onClick: rmBio }, icon('x'), '지문·생체 끄기'))
            : h('button', { class: 'btn btn--primary btn--lg', onClick: regBio }, icon('fingerprint'), '지문·생체 등록하기'),
      ),
      banner('info', { text: '비밀번호는 알아볼 수 없는 형태로 이 기기 안에만 저장돼요. 저희도 볼 수 없어요.' }),
    ),
  );
}

/* ---------- 알림 설정 ---------- */
export async function renderNotifySettings() {
  const d = await store.getNotifyDefaults();
  const mk = (key) => { const cb = h('input', { type: 'checkbox', checked: !!d[key] }); cb.onchange = async () => { d[key] = cb.checked; await store.setNotifyDefaults(d); toast('저장했어요', 'ok'); }; return h('label', { class: 'switch' }, cb, h('span', { class: 'switch__track' })); };

  const daysSel = h('select', { class: 'select', style: { width: '150px', flex: 'none' } }, ...[7, 14, 30, 60].map((n) => h('option', { value: String(n), selected: (d.daysBefore || 30) === n }, `${n}일 전`)));
  daysSel.onchange = async () => { d.daysBefore = Number(daysSel.value); await store.setNotifyDefaults(d); toast('저장했어요', 'ok'); };

  return screen({ plain: true },
    topbar({ title: '알림 설정', back: '/more' }),
    h('div', { class: 'stack-lg' },
      h('div', { class: 'card' },
        h('div', { class: 'settingrow' }, h('div', { class: 'settingrow__main' }, h('div', { class: 'settingrow__title' }, '알림 전체 사용'), h('div', { class: 'settingrow__desc' }, '끄면 모든 알림이 꺼져요')), mk('enabled')),
        h('div', { class: 'settingrow' }, h('div', { class: 'settingrow__main' }, h('div', { class: 'settingrow__title' }, '미납 알림'), h('div', { class: 'settingrow__desc' }, '납기일이 지나도 입금이 없으면')), mk('unpaid')),
        h('div', { class: 'settingrow' }, h('div', { class: 'settingrow__main' }, h('div', { class: 'settingrow__title' }, '계약 만료 알림'), h('div', { class: 'settingrow__desc' }, '만료가 다가오면 미리')), mk('expiry')),
        h('div', { class: 'settingrow' }, h('div', { class: 'settingrow__main' }, h('div', { class: 'settingrow__title' }, '만료 알림 시점')), daysSel),
      ),
      banner('info', { text: '세입자마다 따로 켜고 끄고 싶으면, 그 세입자 화면에서 “이 세입자 알림”을 바꾸면 돼요. 그 설정이 전체 설정보다 우선해요.' }),
    ),
  );
}
