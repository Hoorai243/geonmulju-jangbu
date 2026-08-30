// 아이콘 세트 — 손으로 그린 SVG(일관된 선 두께). 이모지 대신 사용.
// currentColor 를 따르므로 색은 CSS로 제어.
import { svgEl } from './util.js';

const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
  users: '<path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="8" r="3.5"/><path d="M17 4.2a3.5 3.5 0 0 1 0 6.8"/><path d="M21 20v-1a4 4 0 0 0-3-3.8"/>',
  wallet: '<path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h15"/><circle cx="16.5" cy="13.5" r="1.3" fill="currentColor" stroke="none"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10.5 19a1.5 1.5 0 0 0 3 0"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevRight: '<path d="M9 5l7 7-7 7"/>',
  chevDown: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M15 9h4a1 1 0 0 1 1 1v11"/><path d="M2 21h20"/><path d="M8 8h2M8 12h2M8 16h2"/>',
  bank: '<path d="M4 10h16"/><path d="M5 10 12 4l7 6"/><path d="M6 10v7M10 10v7M14 10v7M18 10v7"/><path d="M4 20h16"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
  download: '<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M4 19h16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
  phone: '<path d="M4 5a1 1 0 0 1 1-1h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a1 1 0 0 1-1 1A16 16 0 0 1 4 5z"/>',
  fingerprint: '<path d="M12 5a6 6 0 0 1 6 6v2"/><path d="M6 11a6 6 0 0 1 3-5.2"/><path d="M9 12a3 3 0 0 1 6 0c0 3 .5 5 1.5 6.5"/><path d="M12 12v3c0 1.5-.5 3-1.5 4"/><path d="M6 15c.5 2 .3 3.5-.5 5"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 12a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 10a2 2 0 1 1 0 4 1.6 1.6 0 0 0-1.6 1z"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M16 16l4-4-4-4"/><path d="M20 12H9"/>',
  receipt: '<path d="M6 3h12v18l-2-1.2L14 21l-2-1.2L10 21l-2-1.2L6 21z"/><path d="M9 8h6M9 12h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  sort: '<path d="M7 4v16M7 4 4 7M7 4l3 3"/><path d="M17 20V4M17 20l-3-3M17 20l3-3"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M17 17l2-2M15 15l2-2"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  minus: '<path d="M5 12h14"/>',
  refund: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  logo: '<rect x="3" y="4" width="14" height="17" rx="2" fill="currentColor" opacity=".12"/><path d="M6 8h8M6 12h8M6 16h5"/>',
};

export function icon(name, { size, cls = '' } = {}) {
  const inner = P[name] || P.info;
  const s = svgEl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${inner}</svg>`
  );
  if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
  return s;
}
