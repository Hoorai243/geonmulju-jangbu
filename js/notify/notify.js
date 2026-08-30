// 알림 — 미납/계약만료 안내.
// 발송 "통로(channel)"를 분리: 지금은 문자(SMS) 흉내 스텁, 나중에 카카오 알림톡으로 교체만 하면 됨.
import * as store from '../store.js';
import { won, formatMonth, monthKey, addMonths, compareMonth, parseMonth } from '../util.js';

/* ---------- 발송 통로(channel) 추상화 ---------- */
class StubSmsChannel {
  constructor() { this.name = 'sms-stub'; this.label = '문자(개발용)'; }
  async send({ to, text }) {
    console.info(`[알림-${this.name}] → ${to || '(번호없음)'}\n${text}`);
    return { ok: true, dev: true, channel: this.name };
  }
}
// 미래: class KakaoAlimtalkChannel { name='alimtalk'; async send({to,text,templateId}){...} }

let _channel = new StubSmsChannel();
export function getChannel() { return _channel; }
export function setChannel(c) { _channel = c; }

/* ---------- 메시지 문구 ---------- */
export function unpaidMessage(tenant, month, remaining) {
  return `[임대료 안내] ${tenant.unit}호 ${tenant.name}님, ${formatMonth(month)} 임대료 중 ${won(remaining)}원이 아직 확인되지 않았습니다. 확인 부탁드립니다.`;
}
export function expiryMessage(tenant) {
  return `[계약 안내] ${tenant.unit}호 ${tenant.name}님, 계약 만료가 다가옵니다(${formatMonth(tenant.contractEnd)}). 재계약 여부를 상의드리고자 합니다.`;
}

/* ---------- 발송 ---------- */
export async function sendUnpaid(tenant, month, remaining) {
  return getChannel().send({ to: tenant.phone, text: unpaidMessage(tenant, month, remaining) });
}
export async function sendExpiry(tenant) {
  return getChannel().send({ to: tenant.phone, text: expiryMessage(tenant) });
}

/* ---------- 지금 챙겨야 할 일(알림함/배지 계산) ---------- */
export async function computeAlerts(buildingId, today = monthKey()) {
  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');
  const defaults = await store.getNotifyDefaults();
  const unpaid = [];
  const expiring = [];
  let pending = 0; // 이번 달 아직 완납 아닌 세입자 수

  for (const t of tenants) {
    const on = store.effectiveNotify(t, defaults);
    const led = await store.tenantLedger(t, today);   // 선납 이월 반영
    const st = led.map.get(today);
    if (st && st.state !== 'ok') pending++;
    // 미납(이번 달) — 납기일+3 지났는데 완납 아님
    if (defaults.unpaid && on) {
      if (st && (st.state === 'bad' || (st.state === 'part' && store.isOverdue(t, today)))) {
        unpaid.push({ tenant: t, month: today, remaining: st.remaining, state: st.state });
      }
    }
    // 계약 만료 임박
    if (defaults.expiry && on && t.contractEnd) {
      const monthsLeft = monthsUntil(today, t.contractEnd);
      const threshMonths = Math.ceil((defaults.daysBefore || 30) / 30);
      if (monthsLeft >= 0 && monthsLeft <= threshMonths) {
        expiring.push({ tenant: t, monthsLeft });
      }
    }
  }

  // 월말 정리 알림 — 실제 이번 달을 보고 있고, 월말(기본 25일)이며, 아직 정리할 입금이 남았을 때
  const now = new Date();
  const isCurrentMonth = today === monthKey();
  const dismissed = await store.getBankReminderDismissed();
  const bankReminder = {
    show: !!defaults.enabled && defaults.bankReminder !== false && isCurrentMonth
      && now.getDate() >= (defaults.bankReminderDay || 25)
      && tenants.length > 0 && pending > 0
      && dismissed !== today,
    pending,
    month: today,
  };

  return { unpaid, expiring, bankReminder, total: unpaid.length + expiring.length + (bankReminder.show ? 1 : 0) };
}

function monthsUntil(fromKey, toKey) {
  const a = parseMonth(fromKey), b = parseMonth(toKey);
  return (b.y - a.y) * 12 + (b.m - a.m);
}
