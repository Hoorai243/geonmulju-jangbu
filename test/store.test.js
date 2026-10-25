// 정산 함수 자동 테스트 — 돈 계산의 회귀를 잡는 안전망.
// 외부 도구 없이 node 내장 테스트 러너로 실행: `npm test`
// 기대값은 손으로 따로 계산해 박았다(통과=맞음, 실패=버그).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';

/* ---------- 테스트용 데이터 만들기 ---------- */
function tenant(over = {}) {
  const base = {
    id: 't1', buildingId: 'b1', unit: '101', name: '홍길동', businessName: '',
    kind: 'house', vat: false, bizNo: '', phone: '', deposit: 0, dueDay: 5,
    contractStart: '2026-01', contractEnd: '', trackStart: '',
    status: 'active', notifyOverride: null,
    rentHistory: [{ from: '2026-01', rent: 500000, fee: 0, feeCycle: 'monthly', feeParity: 'odd', water: 0, waterCycle: 'none', waterParity: 'odd' }],
  };
  return { ...base, ...over };
}
let _n = 0;
function pay(month, amount, over = {}) {
  return { id: 'p' + (++_n), tenantId: 't1', buildingId: 'b1', month, amount, depositorName: '', source: 'manual', paidAt: month + '-05', note: '', ...over };
}

/* ================= ratesForMonth (요금 계산) ================= */
test('ratesForMonth: 기본 월세만', () => {
  const r = store.ratesForMonth(tenant(), '2026-03');
  assert.equal(r.total, 500000);
  assert.equal(r.vat, 0);
});
test('ratesForMonth: 계약 시작 전 달은 0', () => {
  assert.equal(store.ratesForMonth(tenant(), '2025-12').total, 0);
});
test('ratesForMonth: 격월 수도세는 홀수달에만 붙음', () => {
  const t = tenant({ rentHistory: [{ from: '2026-01', rent: 500000, fee: 0, feeCycle: 'monthly', feeParity: 'odd', water: 30000, waterCycle: 'bimonthly', waterParity: 'odd' }] });
  assert.equal(store.ratesForMonth(t, '2026-03').total, 530000); // 3월(홀수) = 월세+수도
  assert.equal(store.ratesForMonth(t, '2026-04').total, 500000); // 4월(짝수) = 월세만
});
test('ratesForMonth: 상가 부가세 10% 더해짐', () => {
  const t = tenant({ kind: 'shop', vat: true, rentHistory: [{ from: '2026-01', rent: 1000000, fee: 100000, feeCycle: 'monthly', feeParity: 'odd', water: 0, waterCycle: 'none', waterParity: 'odd' }] });
  const r = store.ratesForMonth(t, '2026-03');
  assert.equal(r.supply, 1100000);
  assert.equal(r.vat, 110000);
  assert.equal(r.total, 1210000);
});
test('ratesForMonth: 요금 변경 이력은 변경월부터 적용', () => {
  const t = tenant({ rentHistory: [
    { from: '2026-01', rent: 500000, fee: 0, feeCycle: 'monthly', feeParity: 'odd', water: 0, waterCycle: 'none', waterParity: 'odd' },
    { from: '2026-06', rent: 600000, fee: 0, feeCycle: 'monthly', feeParity: 'odd', water: 0, waterCycle: 'none', waterParity: 'odd' },
  ] });
  assert.equal(store.ratesForMonth(t, '2026-05').total, 500000); // 변경 전
  assert.equal(store.ratesForMonth(t, '2026-07').total, 600000); // 변경 후
});

/* ================= paymentStatus (완납/부분/미납) ================= */
test('paymentStatus: 완납', () => {
  const s = store.paymentStatus(tenant(), '2026-03', [pay('2026-03', 500000)], '2026-03-10');
  assert.equal(s.state, 'ok');
  assert.equal(s.remaining, 0);
});
test('paymentStatus: 부분납부', () => {
  const s = store.paymentStatus(tenant(), '2026-03', [pay('2026-03', 300000)], '2026-03-10');
  assert.equal(s.state, 'part');
  assert.equal(s.remaining, 200000);
});
test('paymentStatus: 이번 달 납기+3일 전 미입금은 미확인(idle)', () => {
  const s = store.paymentStatus(tenant({ dueDay: 5 }), '2026-03', [], '2026-03-06');
  assert.equal(s.state, 'idle');
});
test('paymentStatus: 이번 달 납기+3일 경과 미입금은 미납(bad)', () => {
  const s = store.paymentStatus(tenant({ dueDay: 5 }), '2026-03', [], '2026-03-10');
  assert.equal(s.state, 'bad');
});
test('paymentStatus: 지난 달 미입금은 미납(bad)', () => {
  const s = store.paymentStatus(tenant(), '2026-01', [], '2026-03-10');
  assert.equal(s.state, 'bad');
});

/* ================= 선납/후납 이월 (computeLedger) ================= */
test('computeLedger: 선납은 다음 달로 이월돼 다음 달도 완납', () => {
  const t = tenant();
  const pays = [pay('2026-01', 1000000)]; // 두 달치 미리
  const { map, net } = store.computeLedger(t, pays, '2026-02', '2026-02-10');
  assert.equal(map.get('2026-01').state, 'ok');
  assert.equal(map.get('2026-02').state, 'ok'); // 선납 이월로 완납
  assert.equal(net, 0);
});
test('computeLedger: 후납은 지난 달을 소급해 고치지 않음(지난 달은 미납)', () => {
  const t = tenant();
  const pays = [pay('2026-02', 1000000)]; // 1월 안 내고 2월에 몰아 냄
  const { map } = store.computeLedger(t, pays, '2026-02', '2026-03-10');
  assert.equal(map.get('2026-01').state, 'bad'); // 지난 1월은 그대로 미납
  assert.equal(map.get('2026-02').state, 'ok');
});

/* ================= 밀림 횟수 (computeLateCountCarry) ================= */
test('computeLateCountCarry: 몰아서 다 갚으면 밀림 0', () => {
  const t = tenant();
  const pays = [pay('2026-02', 1000000)]; // 1월치까지 2월에 갚음
  assert.equal(store.computeLateCountCarry(t, pays, '2026-03'), 0);
});
test('computeLateCountCarry: 한 달치 부족하면 밀림 1', () => {
  const t = tenant();
  const pays = [pay('2026-01', 500000)]; // 두 달 중 한 달치만
  assert.equal(store.computeLateCountCarry(t, pays, '2026-03'), 1);
});

/* ================= 월세/관리비 분리 정산 (computeLedgerSplit) ================= */
test('computeLedgerSplit: 합산 입금은 월세+관리비로 정확히 나뉨', () => {
  const t = tenant({ rentHistory: [{ from: '2026-01', rent: 500000, fee: 100000, feeCycle: 'monthly', feeParity: 'odd', water: 0, waterCycle: 'none', waterParity: 'odd' }] });
  const pays = [pay('2026-01', 600000)];
  const r = store.computeLedgerSplit(t, pays, { upto: '2026-01' });
  assert.equal(r.rentPaid, 500000);
  assert.equal(r.feePaid, 100000);
  assert.equal(r.rentMissed.length, 0);
  assert.equal(r.feeMissed.length, 0);
});
test('computeLedgerSplit: 부족분 합 = 전체 밀린 돈 (QA 불변식)', () => {
  const t = tenant({ rentHistory: [{ from: '2026-01', rent: 500000, fee: 100000, feeCycle: 'monthly', feeParity: 'odd', water: 0, waterCycle: 'none', waterParity: 'odd' }] });
  const pays = [pay('2026-01', 500000)]; // 월세만 내고 관리비 10만 부족
  const r = store.computeLedgerSplit(t, pays, { upto: '2026-01' });
  const rentShort = r.rentDue - r.rentPaid;
  const feeShort = r.feeDue - r.feePaid;
  assert.equal(rentShort + feeShort, 100000); // 전체 밀린 순액과 일치
  assert.equal(feeShort, 100000);
  assert.equal(rentShort, 0);
});

/* ================= 보증금 (depositSummary) ================= */
test('depositSummary: 받음-차감-환불 계산', () => {
  const s = store.depositSummary([
    { type: 'in', amount: 1000000 },
    { type: 'deduct', amount: 200000, category: '수리비' },
  ]);
  assert.equal(s.received, 1000000);
  assert.equal(s.deducted, 200000);
  assert.equal(s.held, 800000);       // 지금 보관 중
  assert.equal(s.refundable, 800000); // 퇴거 시 돌려줄 금액
});

/* ================= 호실 정렬 (unitSort) ================= */
test('unitSort: 숫자 우선 자연 정렬', () => {
  const arr = ['201', '101', '102'].sort(store.unitSort);
  assert.deepEqual(arr, ['101', '102', '201']);
});
