// 공통 화면 틀 — 상단바, 하단 탭바, 빈 상태, 배너.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';

export function topbar({ title, sub, back, right } = {}) {
  return h('header', { class: 'topbar' },
    back && h('button', { class: 'iconbtn', 'aria-label': '뒤로', onClick: () => (typeof back === 'string' ? navigate(back) : history.back()) }, icon('back')),
    h('div', { class: 'grow' },
      h('h1', {}, title),
      sub && h('div', { class: 'sub' }, sub),
    ),
    right,
  );
}

const TABS = [
  { path: '/', label: '현황', icon: 'home' },
  { path: '/tenants', label: '세입자', icon: 'users' },
  { path: '/deposit', label: '보증금', icon: 'wallet' },
  { path: '/more', label: '더보기', icon: 'more' },
];

export function tabbar(active) {
  return h('nav', { class: 'tabbar', 'aria-label': '주요 메뉴' },
    h('div', { class: 'tabbar__inner' },
      ...TABS.map((t) => h('button', {
        class: 'tab' + (t.path === active ? ' tab--on' : ''),
        'aria-current': t.path === active ? 'page' : null,
        onClick: () => navigate(t.path),
      }, icon(t.icon), h('span', {}, t.label))),
    ),
  );
}

// 화면 컨테이너
export function screen({ tab, plain = false } = {}, ...children) {
  const frag = document.createDocumentFragment();
  const main = h('main', { class: 'screen' + (plain ? ' screen--plain' : '') }, ...children);
  frag.appendChild(main);
  if (tab !== undefined) frag.appendChild(tabbar(tab));
  return frag;
}

export function emptyState({ art = 'receipt', title, desc, action } = {}) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__art' }, icon(art)),
    h('div', { class: 'empty__title' }, title),
    desc && h('div', { class: 'empty__desc' }, desc),
    action,
  );
}

export function banner(kind, { title, text, iconName } = {}) {
  return h('div', { class: `banner banner--${kind}` },
    icon(iconName || (kind === 'bad' ? 'alert' : kind === 'warn' ? 'alert' : 'info')),
    h('div', {}, title && h('strong', {}, title), text),
  );
}

// 상태 → 한국어 라벨/클래스
export const STATUS = {
  ok: { label: '완납', cls: 'ok' },
  part: { label: '부분납부', cls: 'warn' },
  bad: { label: '미납', cls: 'bad' },
  idle: { label: '미확인', cls: 'idle' },
};
export function statusChip(state) {
  const s = STATUS[state] || STATUS.idle;
  return h('span', { class: `chip chip--${s.cls}` }, h('span', { class: `dot dot--${s.cls}` }), s.label);
}
