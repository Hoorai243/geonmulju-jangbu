// 세입자 목록(명단) — 등록/수정은 여기서 들어간다. 입금 확인은 “현황” 탭에서.
import { h, won, monthKey } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, emptyState } from '../ui/shell.js';
import * as store from '../store.js';
import { navigate } from '../router.js';

export async function renderTenants() {
  const buildingId = await store.getCurrentBuildingId();
  const tenants = await store.getTenants(buildingId);
  const active = tenants.filter((t) => t.status !== 'movedout');
  const gone = tenants.filter((t) => t.status === 'movedout');
  const month = monthKey();

  const list = h('div', { class: 'stack' });
  for (const t of active) list.appendChild(await row(t, month));

  return screen({ tab: '/tenants' },
    topbar({
      title: '세입자', sub: `${active.length}명`,
      right: h('button', { class: 'iconbtn', 'aria-label': '세입자 등록', onClick: () => navigate('/tenant/new') }, icon('plus')),
    }),
    active.length === 0
      ? emptyState({ art: 'users', title: '아직 세입자가 없어요', desc: '세입자를 등록하면 매달 입금 확인을 할 수 있어요.', action: h('button', { class: 'btn btn--primary btn--lg', onClick: () => navigate('/tenant/new') }, icon('plus'), '세입자 등록하기') })
      : list,
    active.length > 0 && h('button', { class: 'btn btn--secondary btn--lg mt-6', onClick: () => navigate('/tenant/new') }, icon('plus'), '세입자 더 등록'),
    gone.length > 0 && h('div', {},
      h('div', { class: 'section-title' }, '퇴거한 세입자'),
      h('div', { class: 'stack' }, ...await Promise.all(gone.map((t) => row(t, month, true)))),
    ),
  );
}

// 호실/상호 네모 — 글자 수에 따라 폰트 줄이고, 넘치면 네모 안에서 두 줄로.
function unitBox(unit) {
  const u = unit || '—';
  const len = [...u].length;
  const fs = len <= 2 ? '1.05rem' : len === 3 ? '0.9rem' : len === 4 ? '0.78rem' : '0.64rem';
  return h('div', { style: {
    width: '52px', height: '52px', borderRadius: '12px', background: 'var(--primary-tint)', color: 'var(--primary-press)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: fs, flex: 'none',
    overflow: 'hidden', wordBreak: 'break-all', lineHeight: '1.1', textAlign: 'center', padding: '3px', boxSizing: 'border-box',
  } }, u);
}

async function row(t, month, movedout = false) {
  const { total } = store.ratesForMonth(t, month);
  const kindLabel = t.kind === 'shop' ? '상가' : '주택';
  return h('button', { class: 'rowcard', onClick: () => navigate('/tenant/' + t.id) },
    unitBox(t.unit),
    h('div', { class: 'rowcard__main' },
      h('div', { class: 'rowcard__title' }, t.name || '이름없음', movedout && h('span', { class: 'chip chip--idle', style: { marginLeft: '8px' } }, '퇴거')),
      h('div', { class: 'rowcard__meta' }, `${kindLabel}${t.businessName ? ' · ' + t.businessName : ''} · 월 ${won(total)}원`),
    ),
    h('span', { class: 'rowcard__chev' }, icon('chevRight')),
  );
}
