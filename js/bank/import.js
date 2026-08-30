// 은행 거래내역 파일 읽기 — 지금은 국민은행. 다른 은행은 파서만 추가하면 됨.
// 엑셀(.xls/.xlsx)·CSV 만 읽음. PDF·사진은 못 읽음.
import { parseNum, pad2 } from '../util.js';

// SheetJS(읽기용) 를 필요할 때만 로드
let _p = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_p) return _p;
  _p = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/xlsx.full.min.js';
    s.onload = () => res(window.XLSX);
    s.onerror = () => rej(new Error('파일 읽기 기능을 불러오지 못했어요.'));
    document.head.appendChild(s);
  });
  return _p;
}

// "11/3/25" (월/일/두자리연도) → "2025-11-03"
function parseKBDate(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) {
    // 혹시 "2025-11-03" 또는 "2025/11/03" 형태면 그대로 정규화
    const m2 = String(s || '').trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (m2) return `${m2[1]}-${pad2(+m2[2])}-${pad2(+m2[3])}`;
    return '';
  }
  let [, mo, d, y] = m;
  y = y.length === 2 ? '20' + y : y;
  return `${y}-${pad2(+mo)}-${pad2(+d)}`;
}

// 국민은행 파서: 입금 행만 → {date, name, amount}
function parseKB(rows) {
  const hi = rows.findIndex((r) => r.includes('거래일자') && r.some((c) => String(c).includes('적요')));
  if (hi < 0) throw new Error('국민은행 거래내역 형식이 아니에요. (엑셀로 받은 파일인지 확인해 주세요)');
  const H = rows[hi];
  const iDate = H.indexOf('거래일자');
  const iState = H.indexOf('상태');
  const iAmt = H.indexOf('거래금액');
  const iName = H.findIndex((c) => String(c).includes('적요'));
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    if (String(r[iState]).trim() !== '입금') continue;       // 입금만
    const date = parseKBDate(r[iDate]);
    const amount = parseNum(r[iAmt]);
    const name = String(r[iName] || '').trim();
    if (!date || amount <= 0) continue;
    out.push({ date, name, amount });
  }
  return out;
}

const PARSERS = { kb: parseKB };

export const BANKS = [
  { id: 'kb', name: '국민은행', supported: true },
];

// 파일 → 입금 거래 목록
export async function readBankFile(file, bankId = 'kb') {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const parse = PARSERS[bankId] || parseKB;
  return parse(rows);
}
