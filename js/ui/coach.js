// 튜토리얼(코치마크) — 특정 요소를 강조하고 설명을 띄운다. 한 번 본 건 다시 안 뜬다.
import { h } from '../util.js';
import * as db from '../db.js';

export async function hasSeenCoach(key) { return !!(await db.metaGet('coach:' + key)); }
export async function markSeenCoach(key) { await db.metaSet('coach:' + key, true); }
export async function resetCoaches() {
  // 도움말에서 "튜토리얼 다시 보기"용
  shownKeys.clear();
  const all = await db.getAll('meta');
  for (const m of all) if (String(m.key).startsWith('coach:')) await db.del('meta', m.key);
}

// 중복 방지: 하나만 떠 있게 + 같은 안내가 겹쳐 뜨지 않게(화면 2번 그릴 때 대비)
let activeCoach = false;
const shownKeys = new Set();

// coachMark({ target, title, text, seenKey, buttonText })
export async function coachMark({ target, title, text, seenKey, buttonText = '알겠어요' }) {
  if (!target) return;
  if (activeCoach) return;                          // 이미 하나 떠 있으면 무시
  if (seenKey && shownKeys.has(seenKey)) return;    // 이번에 이미 띄움(비동기 경쟁 방지)
  if (seenKey) shownKeys.add(seenKey);              // 동기적으로 먼저 예약
  if (seenKey && await hasSeenCoach(seenKey)) return;
  if (activeCoach) return;                          // await 사이에 다른 게 떴으면 양보

  activeCoach = true;
  target.scrollIntoView({ block: 'center', behavior: 'auto' });
  await new Promise((r) => setTimeout(r, 250));
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) { activeCoach = false; return; } // 화면에 없음
  const pad = 8;

  const layer = h('div');
  const dismiss = () => { layer.remove(); activeCoach = false; if (seenKey) markSeenCoach(seenKey); };

  const backdrop = h('div', { style: { position: 'fixed', inset: '0', zIndex: '199' }, onClick: dismiss });
  const hole = h('div', { style: {
    position: 'fixed', left: (rect.left - pad) + 'px', top: (rect.top - pad) + 'px',
    width: (rect.width + pad * 2) + 'px', height: (rect.height + pad * 2) + 'px',
    borderRadius: '14px', zIndex: '200', pointerEvents: 'none',
    boxShadow: '0 0 0 9999px rgba(20,18,15,.62), 0 0 0 3px var(--primary)',
    animation: 'coachPulse 1.4s ease-in-out infinite',
  } });
  // 카드는 먼저 숨겨서 붙이고, 높이를 잰 뒤 화면 안에 다 보이도록 위치를 잡는다.
  const card = h('div', { class: 'card', style: {
    position: 'fixed', left: '50%', transform: 'translateX(-50%)',
    width: 'min(92vw, 520px)', zIndex: '201', top: '0px', visibility: 'hidden',
  } },
    title && h('div', { style: { fontWeight: 800, fontSize: 'var(--fs-lg)', marginBottom: '6px' } }, title),
    h('div', { style: { color: 'var(--ink-2)', lineHeight: '1.6' } }, text),
    h('button', { class: 'btn btn--primary btn--block', style: { marginTop: '14px' }, onClick: dismiss }, buttonText),
  );

  layer.append(backdrop, hole, card);
  document.body.appendChild(layer);

  // 위치: 아래 공간 있으면 아래, 없으면 위, 그래도 안 되면 화면 안에 맞춤(전체가 보이게)
  const ch = card.offsetHeight;
  const margin = 12;
  let top;
  if (rect.bottom + margin + ch + pad <= window.innerHeight) top = rect.bottom + margin;
  else if (rect.top - margin - ch >= pad) top = rect.top - margin - ch;
  else top = Math.max(pad, Math.min((window.innerHeight - ch) / 2, window.innerHeight - ch - pad));
  card.style.top = Math.round(top) + 'px';
  card.style.visibility = 'visible';
}
