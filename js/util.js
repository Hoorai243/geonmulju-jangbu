// 공통 도우미 — 화면 그리기, 금액/날짜 포맷, 토스트, 바텀시트
// 안전을 위해 문자열을 innerHTML로 바로 넣지 않고 DOM 요소로 조립한다(XSS 방지).

/* ---------- DOM 조립 (하이퍼스크립트) ---------- */
export function h(tag, props, ...children) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'for') e.htmlFor = v;
      else if (k in e && k !== 'list' && k !== 'type' && k !== 'form') { try { e[k] = v; } catch { e.setAttribute(k, v); } }
      else e.setAttribute(k, v);
    }
  }
  append(e, children);
  return e;
}
export function append(parent, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function frag(...children) { const f = document.createDocumentFragment(); append(f, children); return f; }
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- SVG 아이콘 ---------- */
export function svgEl(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstChild;
}

/* ---------- 금액 ---------- */
export const won = (n) => (Number(n) || 0).toLocaleString('ko-KR');
export function wonEl(n, { big = false, cls = '' } = {}) {
  return h('span', { class: `amount won ${big ? 'amount--big' : ''} ${cls}` }, won(n));
}
export function parseNum(str) {
  if (str == null) return 0;
  const d = String(str).replace(/[^\d]/g, '');
  return d ? parseInt(d, 10) : 0;
}
// 입력창에 천단위 콤마 자동
export function attachAmountFormat(input) {
  const fmt = () => {
    const n = parseNum(input.value);
    input.value = n ? n.toLocaleString('ko-KR') : '';
  };
  input.addEventListener('input', fmt);
  fmt();
  return input;
}

/* ---------- 날짜/월 ---------- */
export const pad2 = (n) => String(n).padStart(2, '0');
export function monthKey(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
export function parseMonth(key) { const [y, m] = key.split('-').map(Number); return { y, m }; }
export function formatMonth(key) { const { y, m } = parseMonth(key); return `${y}년 ${m}월`; }
export function addMonths(key, delta) {
  const { y, m } = parseMonth(key);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}
export function compareMonth(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}. ${m}. ${d}.`;
}
export function daysBetween(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  return Math.round((b - a) / 86400000);
}

/* ---------- 토스트 ---------- */
export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const t = h('div', { class: `toast ${kind ? 'toast--' + kind : ''}` }, msg);
  root.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2200);
}

/* ---------- 바텀 시트 ---------- */
export function openSheet({ title, desc, body, onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet__grab' }),
    title && h('h2', { class: 'sheet__title' }, title),
    desc && h('p', { class: 'sheet__desc' }, desc),
  );
  const backdrop = h('div', { class: 'sheet-backdrop' }, sheet);
  const close = () => {
    backdrop.style.animation = 'fade .15s ease reverse';
    sheet.style.animation = 'slideup .2s ease reverse';
    setTimeout(() => { backdrop.remove(); onClose && onClose(); }, 180);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  if (body) append(sheet, [typeof body === 'function' ? body(close) : body]);
  clear(root).appendChild(backdrop);
  return { close, sheet };
}

// 확인 시트 (되돌릴 수 없는 동작용)
export function confirmSheet({ title, desc, confirmText = '확인', danger = false, onConfirm }) {
  openSheet({
    title, desc,
    body: (close) => h('div', { class: 'btn-row', style: { marginTop: '8px' } },
      h('button', { class: 'btn btn--secondary', onClick: close }, '취소'),
      h('button', {
        class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
        onClick: () => { close(); onConfirm && onConfirm(); },
      }, confirmText),
    ),
  });
}

export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
