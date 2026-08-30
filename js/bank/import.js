// 은행 거래내역 파일 읽기 — 여러 은행 공통 구조를 자동 감지.
// 엑셀(.xls/.xlsx)·CSV 만 읽음. PDF·사진은 못 읽음.
// 국민은행은 실제 파일로 검증됨. 다른 은행은 자동 감지(형식이 비슷해 대부분 잡히나,
// 실제 파일로 확정하기 전엔 완벽 보장은 아님).
import { parseNum, pad2 } from '../util.js';

/* ---------- SheetJS(읽기용) 지연 로드 ---------- */
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

/* ---------- 날짜 정규화 (여러 형식) ---------- */
export function parseBankDate(v) {
  let s = String(v || '').trim();
  if (!s) return '';
  s = s.split(/\s+/)[0]; // 시간 부분 제거
  let m;
  if ((m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?$/))) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
  if ((m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/))) { let [, a, b, c] = m; c = c.length === 2 ? '20' + c : c; return `${c}-${pad2(+a)}-${pad2(+b)}`; } // 월/일/연 (국민 등)
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

/* ---------- 열 이름 규칙 ---------- */
const KW = {
  date: /(거래).*(일)|일자|날짜|거래일시|거래일/,
  din: /입금|맡기신|받으신/,          // 입금 금액 열
  dout: /출금|찾으신|보내신금/,       // 출금 금액 열
  state: /입.?출.?금|거래구분|구분|상태|종류|유형/,
  amt: /거래금액|거래액|금액/,        // 단일 금액 열(상태 열과 함께)
  name: /적요|내용|보내는|보내신분|의뢰인|받는분|받는사람|기재|거래기록|메모|상대방|비고|이름/,
};
const matchKW = (cell, re) => re.test(String(cell || '').replace(/\s+/g, ''));

// 헤더 행 찾기: 키워드가 가장 많이 맞는 줄
function findHeader(rows) {
  let best = -1, bestScore = 0;
  const scan = Math.min(rows.length, 30);
  for (let i = 0; i < scan; i++) {
    const r = rows[i];
    let score = 0;
    for (const cell of r) {
      for (const re of Object.values(KW)) if (matchKW(cell, re)) { score++; break; }
    }
    const hasDate = r.some((c) => matchKW(c, KW.date));
    const hasMoney = r.some((c) => matchKW(c, KW.din) || matchKW(c, KW.amt));
    if (hasDate && hasMoney && score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function detectCols(header) {
  const col = { date: -1, din: -1, dout: -1, state: -1, amt: -1, name: -1 };
  header.forEach((cell, i) => {
    const isDin = matchKW(cell, KW.din), isDout = matchKW(cell, KW.dout);
    if (col.date < 0 && matchKW(cell, KW.date)) col.date = i;
    if (col.din < 0 && isDin && !isDout) col.din = i;
    if (col.dout < 0 && isDout) col.dout = i;
    if (col.state < 0 && matchKW(cell, KW.state) && !isDin && !isDout) col.state = i;
    if (col.amt < 0 && matchKW(cell, KW.amt) && !isDin && !isDout) col.amt = i;
    if (col.name < 0 && matchKW(cell, KW.name)) col.name = i;
  });
  return col;
}

// 표준 파서(자동 감지): 입금 행만 → {date, name, amount}
function parseGeneric(rows) {
  const hi = findHeader(rows);
  if (hi < 0) throw new Error('거래내역 형식을 알아보지 못했어요. 엑셀로 받은 파일인지 확인해 주세요.');
  const col = detectCols(rows[hi]);
  if (col.date < 0 || (col.din < 0 && !(col.state >= 0 && col.amt >= 0))) {
    throw new Error('입금 열을 찾지 못했어요. (이 은행 형식은 아직 확정 전이에요 — 파일을 보여주시면 맞춰드릴게요)');
  }
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    let amount = 0;
    if (col.din >= 0) {
      amount = parseNum(r[col.din]);           // 입금 금액 열이 있으면 그 값이 곧 입금
      if (amount <= 0) continue;
    } else {
      if (!String(r[col.state]).includes('입금')) continue; // 상태=입금만
      amount = parseNum(r[col.amt]);
      if (amount <= 0) continue;
    }
    const date = parseBankDate(r[col.date]);
    const name = col.name >= 0 ? String(r[col.name] || '').trim() : '';
    if (!date) continue;
    out.push({ date, name, amount });
  }
  return out;
}

/* ---------- 은행 목록 ---------- */
// 모두 자동 감지 사용. verified=국민은행(실제 파일 검증). 나머지는 자동 감지(best-effort).
export const BANKS = [
  { id: 'kb', name: '국민은행', verified: true },
  { id: 'auto', name: '다른 은행 (자동 감지)', verified: false },
];

export async function readBankFile(file) {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(new Uint8Array(buf), { type: 'array', raw: false });
  } catch (e) {
    const m = (e && e.message) || '';
    if (/password|encrypt/i.test(m)) {
      // 비밀번호로 잠긴(암호화된) 파일 — 토스·카카오 등. 지금 부품으론 못 풀어서 안내로 처리.
      const err = new Error('이 파일은 비밀번호로 잠겨 있어요.');
      err.code = 'ENCRYPTED';
      throw err;
    }
    throw e;
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return parseGeneric(rows);
}
