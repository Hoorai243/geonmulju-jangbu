// 업무 규칙 계층 — 세입자/요금/납부상태/보증금 계산.
// 화면은 이 파일의 함수만 부른다. 저장 위치(db.js)가 바뀌어도 화면은 그대로.
import * as db from './db.js';
import { uid, monthKey, todayISO, compareMonth, addMonths, parseMonth } from './util.js';

// 호실 번호 자연 정렬 (101, 102, 201 ... B1 등 섞여도 숫자 우선)
export function unitSort(a = '', b = '') {
  const na = parseInt(String(a).replace(/[^\d]/g, ''), 10);
  const nb = parseInt(String(b).replace(/[^\d]/g, ''), 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), 'ko');
}

/* ================= 건물 ================= */
export async function getBuildings() { return db.getAll('buildings'); }
export async function getBuilding(id) { return db.get('buildings', id); }
export async function saveBuilding({ id, name, address }) {
  const b = id ? await db.get('buildings', id) : null;
  const rec = b || { id: uid(), createdAt: todayISO() };
  rec.name = name; rec.address = address || '';
  await db.put('buildings', rec);
  return rec;
}
// 현재 작업중인 건물(지금은 1개). meta에 저장.
export async function getCurrentBuildingId() {
  let id = await db.metaGet('currentBuildingId');
  const list = await getBuildings();
  // 저장된 건물이 없거나(백업 불러오기 등으로) 더 이상 존재하지 않으면 첫 건물로 자동 보정
  if (!id || !list.some((b) => b.id === id)) { id = list[0]?.id; if (id) await db.metaSet('currentBuildingId', id); }
  return id;
}
export async function setCurrentBuildingId(id) { await db.metaSet('currentBuildingId', id); }

/* ================= 계좌 ================= */
export async function getAccounts(buildingId) { return db.getBy('accounts', 'byBuilding', buildingId); }
export async function saveAccount({ id, buildingId, bankName, alias }) {
  const rec = (id && await db.get('accounts', id)) || { id: uid(), buildingId, createdAt: todayISO() };
  rec.buildingId = buildingId; rec.bankName = bankName; rec.alias = alias || '';
  await db.put('accounts', rec);
  return rec;
}
export async function deleteAccount(id) { return db.del('accounts', id); }

/* ================= 세입자/계약 ================= */
// tenant 모델:
// { id, buildingId, unit, name, businessName, kind:'house'|'shop', bizNo,
//   deposit, dueDay, contractStart:'YYYY-MM', contractEnd:'YYYY-MM'|'',
//   rentHistory:[{from:'YYYY-MM', rent, fee}],  // 요금 변경 이력(관리비=수도/전기 포함)
//   notifyOverride: null|true|false,
//   status:'active'|'movedout', movedOutAt, createdAt }

export async function getTenants(buildingId) {
  const list = await db.getBy('tenants', 'byBuilding', buildingId);
  return list.sort((a, b) => unitSort(a.unit, b.unit));
}
export async function getTenant(id) { return db.get('tenants', id); }

export async function saveTenant(data) {
  const rec = (data.id && await db.get('tenants', data.id)) || { id: uid(), createdAt: todayISO(), status: 'active' };
  Object.assign(rec, {
    buildingId: data.buildingId,
    unit: data.unit?.trim() || '',
    name: data.name?.trim() || '',
    businessName: data.businessName?.trim() || '',
    kind: data.kind === 'shop' ? 'shop' : 'house',
    bizNo: data.bizNo?.trim() || '',
    vat: data.kind === 'shop' ? !!data.vat : false,   // 상가 부가세(세금계산서) 발행 여부
    phone: data.phone?.trim() || '',
    deposit: Number(data.deposit) || 0,
    dueDay: Math.min(28, Math.max(1, Number(data.dueDay) || 1)),
    contractStart: data.contractStart || monthKey(),
    contractEnd: data.contractEnd || '',
    // 장부(밀림) 세는 시작월. 비우면 계약 시작월부터. 계약이 옛날이어도 최근 달부터만 보고 싶을 때 씀.
    trackStart: data.trackStart || '',
    notifyOverride: data.notifyOverride ?? rec.notifyOverride ?? null,
  });
  // 요금 이력: 신규면 초기 1건, 기존이면 유지
  if (!rec.rentHistory) {
    rec.rentHistory = [{
      from: rec.contractStart, rent: Number(data.rent) || 0,
      fee: Number(data.fee) || 0, feeCycle: data.feeCycle || 'monthly', feeParity: data.feeParity || 'odd',
      water: Number(data.water) || 0, waterCycle: data.waterCycle || 'none', waterParity: data.waterParity || 'odd',
    }];
  }
  await db.put('tenants', rec);
  return rec;
}

// 요금 변경 등록 — 지정한 월부터 새 금액 적용. 그 전 미납은 옛 금액으로 계산됨.
export async function changeRates(tenantId, { from, rent, fee, feeCycle = 'monthly', feeParity = 'odd', water = 0, waterCycle = 'none', waterParity = 'odd' }) {
  const t = await db.get('tenants', tenantId);
  t.rentHistory = (t.rentHistory || []).filter((h) => h.from !== from);
  t.rentHistory.push({ from, rent: Number(rent) || 0, fee: Number(fee) || 0, feeCycle, feeParity, water: Number(water) || 0, waterCycle, waterParity });
  t.rentHistory.sort((a, b) => compareMonth(a.from, b.from));
  await db.put('tenants', t);
  return t;
}
export async function deleteRateChange(tenantId, from) {
  const t = await db.get('tenants', tenantId);
  if (t.rentHistory.length <= 1) return t; // 최소 1건 유지
  t.rentHistory = t.rentHistory.filter((h) => h.from !== from);
  await db.put('tenants', t);
  return t;
}

// 계약 시작일을 옮길 때: 요금이력 첫 달(=세는 시작점)도 같이 옮기고 그 달 요금을 새 값으로.
// 계약 시작일이 실제 "세는 시작점"이 되도록 맞춘다. (첫 달만 이동, 이후 변경 이력은 유지)
export async function rebaseContractStart(tenantId, newFrom, rates = {}) {
  const t = await db.get('tenants', tenantId);
  const hist = [...(t.rentHistory || [])].sort((a, b) => compareMonth(a.from, b.from));
  const oldFirst = hist[0]?.from;
  const rest = hist.slice(1).filter((h) => h.from !== newFrom); // 새 달과 겹치는 뒤 이력 제거(중복 방지)
  const first = { ...(hist[0] || {}), from: newFrom };
  if ('rent' in rates) first.rent = Number(rates.rent) || 0;
  if ('fee' in rates) first.fee = Number(rates.fee) || 0;
  if ('feeCycle' in rates) first.feeCycle = rates.feeCycle;
  if ('feeParity' in rates) first.feeParity = rates.feeParity;
  if ('water' in rates) first.water = Number(rates.water) || 0;
  if ('waterCycle' in rates) first.waterCycle = rates.waterCycle;
  if ('waterParity' in rates) first.waterParity = rates.waterParity;
  t.rentHistory = [first, ...rest].sort((a, b) => compareMonth(a.from, b.from));
  t.contractStart = newFrom;
  await db.put('tenants', t);
  return t;
}

// 특정 월의 적용 요금(변경 이력 반영). 계약 시작 이전 달은 낼 것이 없음(0).
// 수도세(water)는 매월/격월(홀수달·짝수달) 선택 가능 → 부과되는 달에만 total에 더해짐.
export function ratesForMonth(tenant, month) {
  const hist = [...(tenant.rentHistory || [])].sort((a, b) => compareMonth(a.from, b.from));
  const start = hist[0]?.from || tenant.contractStart;
  if (start && compareMonth(month, start) < 0) return { rent: 0, fee: 0, water: 0, waterCharged: false, supply: 0, vat: 0, total: 0 };
  let cur = hist[0] || { rent: 0, fee: 0 };
  for (const h of hist) { if (compareMonth(h.from, month) <= 0) cur = h; }
  const rent = Number(cur.rent) || 0;
  const fee = feeForMonth(cur, month);                     // 관리비(매월/격월)
  const water = waterForMonth(cur, month);                 // 수도세(매월/격월)
  const supply = rent + fee + water;                       // 공급가액(부가세 별도)
  const vat = tenant.vat ? Math.round(supply / 10) : 0;    // 상가 부가세 10%
  return { rent, fee, water, waterCharged: water > 0, supply, vat, total: supply + vat };
}

// 부가세·세금계산서 정리: 여러 달에 걸친 상가(부가세) 세입자별 공급가액/부가세 합
export async function taxSummary(buildingId, months) {
  const tenants = (await getTenants(buildingId)).filter((t) => t.kind === 'shop' && t.vat);
  const rows = tenants.map((t) => {
    let supply = 0, vat = 0;
    for (const m of months) { const r = ratesForMonth(t, m); supply += r.supply; vat += r.vat; }
    return { tenant: t, supply, vat, total: supply + vat };
  }).filter((r) => r.supply > 0);
  const totals = rows.reduce((a, r) => ({ supply: a.supply + r.supply, vat: a.vat + r.vat, total: a.total + r.total }), { supply: 0, vat: 0, total: 0 });
  return { rows, totals };
}

// 이 달에 부과되는 관리비(매월 기본, 격월이면 홀수/짝수 달에만)
function feeForMonth(rateEntry, month) {
  const amt = Number(rateEntry.fee) || 0;
  if (amt <= 0) return 0;
  if ((rateEntry.feeCycle || 'monthly') === 'bimonthly') {
    const m = parseMonth(month).m, isOdd = m % 2 === 1;
    return (rateEntry.feeParity === 'even' ? !isOdd : isOdd) ? amt : 0;
  }
  return amt;
}

// 이 달에 부과되는 수도세 금액(격월이면 해당 달이 아닐 때 0)
function waterForMonth(rateEntry, month) {
  const amt = Number(rateEntry.water) || 0;
  const cycle = rateEntry.waterCycle || 'none';
  if (amt <= 0 || cycle === 'none') return 0;
  if (cycle === 'monthly') return amt;
  if (cycle === 'bimonthly') {
    const m = parseMonth(month).m;
    const isOdd = m % 2 === 1;
    const charge = rateEntry.waterParity === 'even' ? !isOdd : isOdd; // 기본 홀수달
    return charge ? amt : 0;
  }
  return 0;
}

// 관리비 주기 설정 반환
export function feeConfig(tenant, month = monthKey()) {
  const hist = [...(tenant.rentHistory || [])].sort((a, b) => compareMonth(a.from, b.from));
  let cur = hist[0] || {};
  for (const h of hist) { if (compareMonth(h.from, month) <= 0) cur = h; }
  return { amount: Number(cur.fee) || 0, cycle: cur.feeCycle || 'monthly', parity: cur.feeParity || 'odd' };
}

// 세입자의 현재(또는 특정 월 기준) 수도세 설정 반환
export function waterConfig(tenant, month = monthKey()) {
  const hist = [...(tenant.rentHistory || [])].sort((a, b) => compareMonth(a.from, b.from));
  let cur = hist[0] || {};
  for (const h of hist) { if (compareMonth(h.from, month) <= 0) cur = h; }
  return {
    amount: Number(cur.water) || 0,
    cycle: cur.waterCycle || 'none',
    parity: cur.waterParity || 'odd',
  };
}

export async function setNotifyOverride(id, value) {
  const t = await db.get('tenants', id);
  t.notifyOverride = value; // true | false | null
  await db.put('tenants', t);
  return t;
}

export async function moveOutTenant(id, dateISO) {
  const t = await db.get('tenants', id);
  t.status = 'movedout'; t.movedOutAt = dateISO || todayISO();
  await db.put('tenants', t);
  return t;
}
export async function reactivateTenant(id) {
  const t = await db.get('tenants', id);
  t.status = 'active'; t.movedOutAt = null;
  await db.put('tenants', t);
  return t;
}

export async function deleteTenant(id) {
  // 세입자 삭제 시 관련 기록도 정리
  const pays = await db.getBy('payment_log', 'byTenant', id);
  for (const p of pays) await db.del('payment_log', p.id);
  const led = await db.getBy('deposit_ledger', 'byTenant', id);
  for (const l of led) await db.del('deposit_ledger', l.id);
  await db.del('tenants', id);
}

/* ================= 입금 기록(payment_log) ================= */
// payment 모델:
// { id, buildingId, tenantId|null, month:'YYYY-MM', amount, depositorName,
//   source:'manual'|'bank', paidAt:ISO, note, createdAt }
export async function getPaymentsForTenantMonth(tenantId, month) {
  const list = await db.getBy('payment_log', 'byTenant', tenantId);
  return list.filter((p) => p.month === month);
}
export async function getPaymentsByMonth(buildingId, month) {
  const list = await db.getBy('payment_log', 'byMonth', month);
  return list.filter((p) => p.buildingId === buildingId);
}
export async function getAllPaymentsForTenant(tenantId) {
  const list = await db.getBy('payment_log', 'byTenant', tenantId);
  return list.sort((a, b) => (a.month === b.month ? (a.paidAt < b.paidAt ? -1 : 1) : compareMonth(a.month, b.month)));
}
export async function addPayment({ buildingId, tenantId, month, amount, depositorName, source = 'manual', paidAt, note, accountId, txTime }) {
  const rec = {
    id: uid(), buildingId, tenantId: tenantId || null, month: month || monthKey(),
    amount: Number(amount) || 0, depositorName: depositorName || '',
    source, paidAt: paidAt || todayISO(), note: note || '', accountId: accountId || null, createdAt: new Date().toISOString(),
  };
  if (txTime) rec.txTime = txTime; // 은행 거래 시각(같은 날 같은 금액 구분용)
  await db.put('payment_log', rec);
  return rec;
}
export async function updatePayment(id, patch) {
  const p = await db.get('payment_log', id);
  Object.assign(p, patch);
  await db.put('payment_log', p);
  return p;
}
export async function deletePayment(id) { return db.del('payment_log', id); }

// 입금자명 매칭 규칙(기억): 별칭(이름→세입자)과 제외 목록. 은행파일 정리를 빠르게.
export async function getMatchRules(buildingId) {
  return (await db.metaGet('matchRules:' + buildingId)) || { aliases: {}, ignores: [] };
}
export async function saveMatchRules(buildingId, rules) {
  await db.metaSet('matchRules:' + buildingId, rules);
}

export async function getAllPaymentsForBuilding(buildingId) {
  const all = await db.getAll('payment_log');
  return all.filter((p) => p.buildingId === buildingId);
}

// 이 건물에서 '은행 입금 → 보증금으로 옮김' 기록들 (은행파일 재불러오기 중복검사용)
export async function getBankDepositsForBuilding(buildingId) {
  const tenants = await db.getBy('tenants', 'byBuilding', buildingId);
  const ids = new Set(tenants.map((t) => t.id));
  const all = await db.getAll('deposit_ledger');
  return all.filter((l) => ids.has(l.tenantId) && l.type === 'in' && l.source === 'bank');
}

// 미확인 입금(세입자에 아직 못 붙인 입금)
export async function getUnmatched(buildingId) {
  const all = await db.getAll('payment_log');
  return all.filter((p) => p.buildingId === buildingId && !p.tenantId)
    .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
}

/* ================= 납부 상태 계산 ================= */
// state: 'ok'(완납) | 'part'(부분) | 'bad'(미납) | 'idle'(미확인/회색)
export function paymentStatus(tenant, month, payments, today = todayISO()) {
  const { total: due } = ratesForMonth(tenant, month);
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  let state;
  if (due <= 0) state = paid > 0 ? 'ok' : 'idle';   // 낼 것이 없는 달(계약 전 등)
  else if (paid >= due) state = 'ok';
  else if (paid > 0) state = 'part';
  else {
    // 미납 판정: 이번 달이면 납기일+3 지났는지, 지난 달이면 무조건 미납
    const overdue = isOverdue(tenant, month, today);
    state = overdue ? 'bad' : 'idle';
  }
  return { state, paid, due, remaining: Math.max(0, due - paid) };
}
export function isOverdue(tenant, month, today = todayISO()) {
  const cur = monthKey(new Date(today));
  if (compareMonth(month, cur) < 0) return true;          // 지난 달인데 안 냄
  if (compareMonth(month, cur) > 0) return false;         // 미래
  const dueDay = tenant.dueDay || 1;
  const [ty, tm, td] = today.split('-').map(Number);
  // 이번 달 납기일 + 3일
  const limit = new Date(ty, tm - 1, dueDay + 3);
  return new Date(ty, tm - 1, td) > limit;
}

// 지금까지 밀린 횟수(계약시작~지난달 중 완납 못한 달 수)
export async function lateCount(tenant, uptoMonth = monthKey()) {
  let m = tenant.contractStart;
  let count = 0;
  const end = tenant.status === 'movedout' && tenant.movedOutAt ? monthKey(new Date(tenant.movedOutAt)) : uptoMonth;
  // 지난 달까지만 (이번 달은 아직 진행 중일 수 있으니 제외)
  const lastClosed = addMonths(uptoMonth, -1);
  const stop = compareMonth(end, lastClosed) < 0 ? end : lastClosed;
  let guard = 0;
  while (compareMonth(m, stop) <= 0 && guard++ < 600) {
    const { total: due } = ratesForMonth(tenant, m);
    if (due > 0) {
      const pays = await getPaymentsForTenantMonth(tenant.id, m);
      const { state } = paymentStatus(tenant, m, pays, todayISO());
      if (state !== 'ok') count++;
    }
    m = addMonths(m, 1);
  }
  return count;
}

// 선납/후납 반영 정산 — 넘치게 낸 달의 돈이 다음 달로 이월되고,
// 전체 순액(net: +선납 / -밀림)도 계산. upto 달까지.
export async function tenantLedger(tenant, upto = monthKey()) {
  const base = tenant.rentHistory?.[0]?.from || tenant.contractStart;
  // 장부 시작월(trackStart)이 있으면 그 달부터만 센다(계약보다 뒤일 때만 — 앞이면 요금이 없어 의미 없음).
  const start = (tenant.trackStart && base && compareMonth(tenant.trackStart, base) > 0) ? tenant.trackStart : base;
  const moved = tenant.status === 'movedout' && tenant.movedOutAt ? monthKey(new Date(tenant.movedOutAt)) : null;
  const end = moved && compareMonth(moved, upto) < 0 ? moved : upto;
  const pays = await getAllPaymentsForTenant(tenant.id);
  const byMonth = {};
  for (const p of pays) byMonth[p.month] = (byMonth[p.month] || 0) + (Number(p.amount) || 0);
  const map = new Map();
  const today = todayISO();
  // 전진 이월(선납): 그 달 입금 + 지난 선납으로 그 달을 채운다. "이번 달 냈나"를 정확히 보여줌.
  // (후납=밀렸다 나중에 갚음은 대시보드가 아니라 '납부 요약'에서만 따로 반영한다)
  let credit = 0, net = 0, m = start, guard = 0;
  while (start && compareMonth(m, end) <= 0 && guard++ < 800) {
    const due = ratesForMonth(tenant, m).total;
    const paid = byMonth[m] || 0;
    const avail = credit + paid;         // 이월된 선납 + 이 달 입금
    let state;
    if (due <= 0) state = paid > 0 ? 'ok' : 'idle';
    else if (avail >= due) state = 'ok';
    else if (avail > 0) state = 'part';
    else state = isOverdue(tenant, m, today) ? 'bad' : 'idle';
    map.set(m, { state, due, paid, avail, remaining: due > 0 ? Math.max(0, due - avail) : 0, carried: due > 0 && paid < due && avail >= due });
    credit = Math.max(0, avail - due);   // 남은 선납 다음 달로 이월
    net += paid - due;                   // 전체 순액(+선납 / -밀림)
    m = addMonths(m, 1);
  }
  return { map, net, credit };
}

// 월세/관리비 분리 정산 (선택 구간). 관리비성 입금(수도/전기/관리비 이름·수기 관리비·그달 관리비 이하 소액)을
// 먼저 관리비로 가려내고, 나머지를 월세로 본다. 월세를 넘게 낸 몫(합쳐 낸 관리비 포함분)은 관리비로 넘겨준다.
// (관리비 = 관리비 + 수도세). from/to 없으면 전체 기간.
// 입금 하나를 월세/관리비로 판단.
//  1) 직접 정한 구분(payKind: 'rent'|'fee'|'both')이 있으면 그대로 따름 (내가 고친 것)
//  2) 메모에 '관리비', 입금자에 '수도/전기/관리' → 관리비
//  3) 그 달 관리비/월세/합계와 '정확히 같은 금액' → 그쪽으로 확정
//  4) 그래도 애매하면 poolThis 로 남겨 그 달 안에서 월세부터 채움
// 반환: { fee, rent, pool } — 이 입금이 그 달 관리비/월세로 확정된 금액과, 애매하게 남은 금액
function classifyPayment(p, rent_m, fee_m) {
  const a = p.amount || 0;
  const tag = p.payKind;
  if (tag === 'fee') return { fee: a, rent: 0, pool: 0 };
  if (tag === 'rent') return { fee: 0, rent: a, pool: 0 };
  if (tag === 'both') { const f = Math.min(a, fee_m); return { fee: f, rent: a - f, pool: 0 }; }
  const kwFee = (p.source === 'manual' && /관리비/.test(p.note || '')) || /수도|전기|관리/.test(p.depositorName || '');
  if (kwFee) return { fee: a, rent: 0, pool: 0 };
  if (fee_m > 0 && a === fee_m) return { fee: a, rent: 0, pool: 0 };
  if (rent_m > 0 && a === rent_m) return { fee: 0, rent: a, pool: 0 };
  if (rent_m + fee_m > 0 && a === rent_m + fee_m) return { fee: fee_m, rent: rent_m, pool: 0 };
  return { fee: 0, rent: 0, pool: a };
}

// 월세/관리비를 나눠서 얼마 청구·받음·부족인지, 어느 달을 빼먹었는지 계산.
// 방식: (1) 그 달 입금은 그 달 것부터 메꾼다  (2) 넘친 몫만 오래된 미납부터 이월한다.
//  → 몰아서 낸 달(밀렸다 한꺼번에 낸 것)도, 그 달에 낸 관리비도 제대로 잡힘.
export async function tenantLedgerSplit(tenant, { from = '', to = '', upto = monthKey() } = {}) {
  const base = tenant.rentHistory?.[0]?.from || tenant.contractStart;
  const startBase = (tenant.trackStart && base && compareMonth(tenant.trackStart, base) > 0) ? tenant.trackStart : base;
  const moved = tenant.status === 'movedout' && tenant.movedOutAt ? monthKey(new Date(tenant.movedOutAt)) : null;
  const endCap = moved && compareMonth(moved, upto) < 0 ? moved : upto;
  const rangeStart = (from && compareMonth(from, startBase) > 0) ? from : startBase;
  const rangeEnd = (to && compareMonth(to, endCap) < 0) ? to : endCap;

  const byMonth = new Map();
  const pays = (await getAllPaymentsForTenant(tenant.id)).filter((p) => compareMonth(p.month, rangeStart) >= 0 && compareMonth(p.month, rangeEnd) <= 0);
  for (const p of pays) { if (!byMonth.has(p.month)) byMonth.set(p.month, []); byMonth.get(p.month).push(p); }

  let rentDue = 0, feeDue = 0, m = rangeStart, guard = 0;
  const rows = [];
  while (rangeStart && compareMonth(m, rangeEnd) <= 0 && guard++ < 800) {
    const r = ratesForMonth(tenant, m);
    const rent_m = r.rent || 0, fee_m = (r.fee || 0) + (r.water || 0);
    rentDue += rent_m; feeDue += fee_m;
    let feeGot = 0, rentGot = 0, pool = 0;
    for (const p of (byMonth.get(m) || [])) { const c = classifyPayment(p, rent_m, fee_m); feeGot += c.fee; rentGot += c.rent; pool += c.pool; }
    // 그 달 것부터 메꾸기
    let rentCover = Math.min(rent_m, rentGot), rentExtra = rentGot - rentCover;
    let feeCover = Math.min(fee_m, feeGot), feeExtra = feeGot - feeCover;
    let rentRem = rent_m - rentCover, feeRem = fee_m - feeCover;
    const toRent = Math.min(pool, rentRem); rentCover += toRent; pool -= toRent; rentRem -= toRent;
    const toFee = Math.min(pool, feeRem); feeCover += toFee; pool -= toFee; feeRem -= toFee;
    rows.push({ month: m, rentRem, feeRem, rentExtra: rentExtra + pool, feeExtra });
    m = addMonths(m, 1);
  }
  // 넘친 몫을 오래된 미납부터 이월. 각자(월세→월세, 관리비→관리비) 먼저 메꾸고,
  // 그래도 남은 초과분은 서로 넘긴다(월세 초과→관리비 미납, 관리비 초과→월세 미납).
  // 이래야 '월세 부족 + 관리비 부족' 합계가 전체 밀린 돈(순액)과 정확히 맞는다.
  let rentPool = rows.reduce((s, r) => s + r.rentExtra, 0);
  for (const r of rows) { if (rentPool <= 0) break; if (r.rentRem > 0) { const c = Math.min(rentPool, r.rentRem); r.rentRem -= c; rentPool -= c; } }
  let feePool = rows.reduce((s, r) => s + r.feeExtra, 0);
  for (const r of rows) { if (feePool <= 0) break; if (r.feeRem > 0) { const c = Math.min(feePool, r.feeRem); r.feeRem -= c; feePool -= c; } }
  // 남은 초과분(월세·관리비 통합)으로 남은 미납을 마저 메꾼다 — 월세 미납 먼저, 그다음 관리비 미납
  let extra = rentPool + feePool;
  for (const r of rows) { if (extra <= 0) break; if (r.rentRem > 0) { const c = Math.min(extra, r.rentRem); r.rentRem -= c; extra -= c; } }
  for (const r of rows) { if (extra <= 0) break; if (r.feeRem > 0) { const c = Math.min(extra, r.feeRem); r.feeRem -= c; extra -= c; } }

  const rentMissed = rows.filter((r) => r.rentRem > 0).map((r) => ({ month: r.month, short: r.rentRem }));
  const feeMissed = rows.filter((r) => r.feeRem > 0).map((r) => ({ month: r.month, short: r.feeRem }));
  const rentShort = rentMissed.reduce((s, x) => s + x.short, 0);
  const feeShort = feeMissed.reduce((s, x) => s + x.short, 0);
  return { rentDue, feeDue, rentPaid: rentDue - rentShort, feePaid: feeDue - feeShort, feeMissed, rentMissed };
}

// upto까지 밀린 횟수(선납 이월 반영). 완납 못한 달 수.
export async function lateCountCarry(tenant, upto = monthKey()) {
  const last = addMonths(upto, -1); // 이번 달은 진행 중일 수 있어 제외
  const { map } = await tenantLedger(tenant, last);
  const months = [...map.keys()].sort((a, b) => (a < b ? -1 : 1));
  // 후납(밀렸다 나중에 갚음)까지 반영: 전체 낸 돈을 오래된 달부터 채우고, 끝까지 못 채운 달만 센다.
  // (요약의 '완납 못한 달'과 같은 기준 — 세입자 상세의 '밀림 횟수'와 숫자가 어긋나지 않게)
  let pool = 0;
  for (const [, s] of map) pool += s.paid;
  let n = 0;
  for (const mm of months) {
    const s = map.get(mm);
    if (s.due <= 0) continue;
    const cov = Math.min(pool, s.due); pool -= cov;
    if (cov < s.due) n++;
  }
  return n;
}

/* ================= 보증금(deposit_ledger) ================= */
// { id, tenantId, type:'in'|'deduct'|'refund', amount, category, memo, date, createdAt }
export async function getLedger(tenantId) {
  const list = await db.getBy('deposit_ledger', 'byTenant', tenantId);
  return list.sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : (a.date < b.date ? -1 : 1)));
}
export async function addLedger({ tenantId, type, amount, category, memo, date, accountId, source }) {
  const rec = { id: uid(), tenantId, type, amount: Number(amount) || 0, category: category || '', memo: memo || '', date: date || todayISO(), accountId: accountId || null, source: source || 'manual', createdAt: new Date().toISOString() };
  await db.put('deposit_ledger', rec);
  return rec;
}
export async function deleteLedger(id) { return db.del('deposit_ledger', id); }

export function depositSummary(ledger) {
  let received = 0, deducted = 0, refunded = 0;
  for (const l of ledger) {
    if (l.type === 'in') received += l.amount;
    else if (l.type === 'deduct') deducted += l.amount;
    else if (l.type === 'refund') refunded += l.amount;
  }
  return {
    received, deducted, refunded,
    held: received - deducted - refunded,       // 현재 보관 중
    refundable: received - deducted,            // 퇴거 시 돌려줄 금액(환불 전 기준)
  };
}

/* ================= 알림 설정 ================= */
export async function getNotifyDefaults() {
  return { enabled: true, unpaid: true, expiry: true, daysBefore: 30, bankReminder: true, bankReminderDay: 25, ...(await db.metaGet('notifyDefaults')) };
}
export async function setNotifyDefaults(v) { await db.metaSet('notifyDefaults', v); }

// 월말 정리 알림 "이번 달 안 보기" 기억 (값은 'YYYY-MM')
export async function getBankReminderDismissed() { return await db.metaGet('bankReminderDismissed'); }
export async function dismissBankReminder(month) { await db.metaSet('bankReminderDismissed', month); }

// 마지막 백업 시각(ISO) — 백업 챙김 알림용
export async function getLastBackupAt() { return await db.metaGet('lastBackupAt'); }

// 안내 문자 문구 템플릿 (kind: 'unpaid' | 'expiry')
export async function getMsgTemplate(kind) { return await db.metaGet('msgTemplate:' + kind); }
export async function saveMsgTemplate(kind, text) { await db.metaSet('msgTemplate:' + kind, text); }

// 세입자별 유효 알림 여부(개별 설정이 전체값을 덮어씀)
export function effectiveNotify(tenant, defaults) {
  if (tenant.notifyOverride === true) return true;
  if (tenant.notifyOverride === false) return false;
  return !!defaults.enabled;
}
