// 튜토리얼(코치마크) — 특정 요소를 강조하고 설명을 띄운다. 한 번 본 건 다시 안 뜬다.
import { h } from '../util.js';
import * as db from '../db.js';

export async function hasSeenCoach(key) { return !!(await db.metaGet('coach:' + key)); }
export async function markSeenCoach(key) { await db.metaSet('coach:' + key, true); }
export async function resetCoaches() {
  // 도움말에서 "튜토리얼 다시 보기"용
  const all = await db.getAll('meta');
  for (const m of all) if (String(m.key).startsWith('coach:')) await db.del('meta', m.key);
}

// coachMark({ target, title, text, seenKey, buttonText })
export async function coachMark({ target, title, text, seenKey, buttonText = '알겠어요' }) {
  if (!target) return;
  if (seenKey && await hasSeenCoach(seenKey)) return;

  target.scrollIntoView({ block: 'center', behavior: 'auto' });
  await new Promise((r) => setTimeout(r, 250));
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return; // 화면에 없음
  const pad = 8;

  const layer = h('div');
  const dismiss = () => { layer.remove(); if (seenKey) markSeenCoach(seenKey); };

  const backdrop = h('div', { style: { position: 'fixed', inset: '0', zIndex: '199' }, onClick: dismiss });
  const hole = h('div', { style: {
    position: 'fixed', left: (rect.left - pad) + 'px', top: (rect.top - pad) + 'px',
    width: (rect.width + pad * 2) + 'px', height: (rect.height + pad * 2) + 'px',
    borderRadius: '14px', zIndex: '200', pointerEvents: 'none',
    boxShadow: '0 0 0 9999px rgba(20,18,15,.62), 0 0 0 3px var(--primary)',
    animation: 'coachPulse 1.4s ease-in-out infinite',
  } });
  const below = rect.bottom + 220 < window.innerHeight;
  const card = h('div', { class: 'card', style: {
    position: 'fixed', left: '50%', transform: 'translateX(-50%)',
    width: 'min(92vw, 520px)', zIndex: '201',
    [below ? 'top' : 'bottom']: (below ? rect.bottom + pad + 16 : window.innerHeight - rect.top + pad + 16) + 'px',
  } },
    title && h('div', { style: { fontWeight: 800, fontSize: 'var(--fs-lg)', marginBottom: '6px' } }, title),
    h('div', { style: { color: 'var(--ink-2)', lineHeight: '1.6' } }, text),
    h('button', { class: 'btn btn--primary btn--block', style: { marginTop: '14px' }, onClick: dismiss }, buttonText),
  );

  layer.append(backdrop, hole, card);
  document.body.appendChild(layer);
}
