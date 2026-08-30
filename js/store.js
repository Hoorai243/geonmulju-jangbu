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
  if (!id) { const list = await getBuildings(); id = list[0]?.id; if (id) await db.metaSet('currentBuildingId', id); }
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
    phone: data.phone?.trim() || '',
    deposit: Number(data.deposit) || 0,
    dueDay: Math.min(28, Math.max(1, Number(data.dueDay) || 1)),
    contractStart: data.contractStart || monthKey(),
    contractEnd: data.contractEnd || '',
    notifyOverride: data.notifyOverride ?? rec.notifyOverride ?? null,
  });
  // 요금 이력: 신규면 초기 1건, 기존이면 유지
  if (!rec.rentHistory) {
    rec.rentHistory = [{
      from: rec.contractStart, rent: Number(data.rent) || 0, fee: Number(data.fee) || 0,
      water: Number(data.water) || 0, waterCycle: data.waterCycle || 'none', waterParity: data.waterParity || 'odd',
    }];
  }
  await db.put('tenants', rec);
  return rec;
}

// 요금 변경 등록 — 지정한 월부터 새 금액 적용. 그 전 미납은 옛 금액으로 계산됨.
export async function changeRates(tenantId, { from, rent, fee, water = 0, waterCycle = 'none', waterParity = 'odd' }) {
  const t = await db.get('tenants', tenantId);
  t.rentHistory = (t.rentHistory || []).filter((h) => h.from !== from);
  t.rentHistory.push({ from, rent: Number(rent) || 0, fee: Number(fee) || 0, water: Number(water) || 0, waterCycle, waterParity });
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

// 특정 월의 적용 요금(변경 이력 반영). 계약 시작 이전 달은 낼 것이 없음(0).
// 수도세(water)는 매월/격월(홀수달·짝수달) 선택 가능 → 부과되는 달에만 total에 더해짐.
export function ratesForMonth(tenant, month) {
  const hist = [...(tenant.rentHistory || [])].sort((a, b) => compareMonth(a.from, b.from));
  const start = hist[0]?.from || tenant.contractStart;
  if (start && compareMonth(month, start) < 0) return { rent: 0, fee: 0, water: 0, waterCharged: false, total: 0 };
  let cur = hist[0] || { rent: 0, fee: 0 };
  for (const h of hist) { if (compareMonth(h.from, month) <= 0) cur = h; }
  const rent = Number(cur.rent) || 0, fee = Number(cur.fee) || 0;
  const water = waterForMonth(cur, month);
  return { rent, fee, water, waterCharged: water > 0, total: rent + fee + water };
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
export async function addPayment({ buildingId, tenantId, month, amount, depositorName, source = 'manual', paidAt, note }) {
  const rec = {
    id: uid(), buildingId, tenantId: tenantId || null, month: month || monthKey(),
    amount: Number(amount) || 0, depositorName: depositorName || '',
    source, paidAt: paidAt || todayISO(), note: note || '', createdAt: new Date().toISOString(),
  };
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

/* ================= 보증금(deposit_ledger) ================= */
// { id, tenantId, type:'in'|'deduct'|'refund', amount, category, memo, date, createdAt }
export async function getLedger(tenantId) {
  const list = await db.getBy('deposit_ledger', 'byTenant', tenantId);
  return list.sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : (a.date < b.date ? -1 : 1)));
}
export async function addLedger({ tenantId, type, amount, category, memo, date }) {
  const rec = { id: uid(), tenantId, type, amount: Number(amount) || 0, category: category || '', memo: memo || '', date: date || todayISO(), createdAt: new Date().toISOString() };
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
  return (await db.metaGet('notifyDefaults')) || { enabled: true, unpaid: true, expiry: true, daysBefore: 30 };
}
export async function setNotifyDefaults(v) { await db.metaSet('notifyDefaults', v); }

// 세입자별 유효 알림 여부(개별 설정이 전체값을 덮어씀)
export function effectiveNotify(tenant, defaults) {
  if (tenant.notifyOverride === true) return true;
  if (tenant.notifyOverride === false) return false;
  return !!defaults.enabled;
}
