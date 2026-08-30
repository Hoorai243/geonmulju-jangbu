// 아주 단순한 화면 라우터(주소창 # 기반, 서버 없이 동작).
import { clear } from './util.js';

const routes = [];
let notFound = null;
let beforeEach = null;

export function route(pattern, handler) {
  // pattern 예: '/tenant/:id'
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ rx, keys, handler });
}
export function setNotFound(fn) { notFound = fn; }
export function setBeforeEach(fn) { beforeEach = fn; }

export function navigate(path, { replace = false } = {}) {
  const target = '#' + path;
  if (replace) location.replace(target); else location.hash = target;
  if (('#' + currentPath()) === target) render(); // 같은 해시면 강제 렌더
}
export function currentPath() { return (location.hash || '#/').slice(1) || '/'; }

async function render() {
  let path = currentPath();
  if (beforeEach) {
    const redirect = await beforeEach(path);
    if (redirect && redirect !== path) { navigate(redirect, { replace: true }); return; }
  }
  path = currentPath();
  const [pathname] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(path.split('?')[1] || ''));
  for (const r of routes) {
    const m = r.rx.exec(pathname);
    if (m) {
      const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      await mount(r.handler, { params, query });
      return;
    }
  }
  if (notFound) await mount(notFound, { params: {}, query });
}

async function mount(handler, ctx) {
  const app = document.getElementById('app');
  try {
    const node = await handler(ctx);
    clear(app);
    if (node) app.appendChild(node);
    app.firstElementChild && app.firstElementChild.classList.add('fade-in');
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    clear(app);
    app.appendChild(errorView(err));
  }
}

function errorView(err) {
  const d = document.createElement('div');
  d.className = 'screen screen--plain';
  d.innerHTML = `<div class="empty"><div class="empty__title">문제가 생겼어요</div><div class="empty__desc">잠시 후 다시 시도해 주세요.</div></div>`;
  return d;
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
