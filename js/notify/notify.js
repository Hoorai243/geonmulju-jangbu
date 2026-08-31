// 알림 — 미납/계약만료 안내.
// 발송 "통로(channel)"를 분리: 지금은 문자(SMS) 흉내 스텁, 나중에 카카오 알림톡으로 교체만 하면 됨.
import * as store from '../store.js';
import { won, formatMonth, monthKey, addMonths, compareMonth, parseMonth, unitLabel } from '../util.js';
import { ignoreNextBackground } from '../auth/autolock.js';

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

/* ---------- 메시지 문구 (건물주가 고칠 수 있는 템플릿) ---------- */
// 자리표시: {호실} {이름} {월} {금액} {만료월}
const DEFAULT_UNPAID = '[임대료 안내] {호실} {이름}님, {월} 임대료 중 {금액}원이 아직 확인되지 않았습니다. 확인 부탁드립니다.';
const DEFAULT_EXPIRY = '[계약 안내] {호실} {이름}님, 계약 만료가 다가옵니다({만료월}).';
const rep = (s, a, b) => (a == null || a === '' ? s : s.split(a).join(b));

function fillUnpaid(tpl, tenant, month, remaining) {
  let s = rep(tpl, '{호실}', unitLabel(tenant.unit));
  s = rep(s, '{이름}', tenant.name); s = rep(s, '{월}', formatMonth(month)); s = rep(s, '{금액}', won(remaining));
  return s;
}
function fillExpiry(tpl, tenant) {
  let s = rep(tpl, '{호실}', unitLabel(tenant.unit));
  s = rep(s, '{이름}', tenant.name); s = rep(s, '{만료월}', formatMonth(tenant.contractEnd));
  return s;
}

export async function unpaidMessage(tenant, month, remaining) {
  return fillUnpaid((await store.getMsgTemplate('unpaid')) || DEFAULT_UNPAID, tenant, month, remaining);
}
export async function expiryMessage(tenant) {
  return fillExpiry((await store.getMsgTemplate('expiry')) || DEFAULT_EXPIRY, tenant);
}

// 건물주가 고친 문자에서 이 세입자의 값들을 다시 자리표시로 되돌려 "공통 문구"로 저장.
// 이름이 그대로 남으면(되돌리기 실패) 저장하지 않는다 — 다른 세입자 문자에 이 이름이 새지 않게.
export async function saveUnpaidFromEdited(edited, tenant, month, remaining) {
  let t = rep(edited, won(remaining), '{금액}');
  t = rep(t, formatMonth(month), '{월}'); t = rep(t, tenant.name, '{이름}'); t = rep(t, unitLabel(tenant.unit), '{호실}');
  if (tenant.name && t.includes(tenant.name)) return false;
  await store.saveMsgTemplate('unpaid', t); return true;
}
export async function saveExpiryFromEdited(edited, tenant) {
  let t = rep(edited, formatMonth(tenant.contractEnd), '{만료월}');
  t = rep(t, tenant.name, '{이름}'); t = rep(t, unitLabel(tenant.unit), '{호실}');
  if (tenant.name && t.includes(tenant.name)) return false;
  await store.saveMsgTemplate('expiry', t); return true;
}

/* ---------- 발송 ---------- */
export async function sendUnpaid(tenant, month, remaining) {
  return getChannel().send({ to: tenant.phone, text: unpaidMessage(tenant, month, remaining) });
}
export async function sendExpiry(tenant) {
  return getChannel().send({ to: tenant.phone, text: expiryMessage(tenant) });
}

// 실제 발송 대신 폰의 문자 앱을 미리 쓴 내용과 함께 연다. (사장님이 확인 후 직접 전송)
// sms: 링크는 안드로이드·아이폰 문자 앱을 열어준다. 요금/전송은 통신사 문자 그대로.
export function openSms(to, text) {
  const num = String(to || '').replace(/[^0-9+]/g, '');
  if (!num) return false;
  const url = 'sms:' + num + '?body=' + encodeURIComponent(text);
  try { ignoreNextBackground(); window.location.href = url; return true; } catch (e) { console.warn('문자 앱 열기 실패', e); return false; }
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

  // 데이터 안전 — 백업이 오래됐거나 한 번도 안 했으면 챙김(세입자가 있을 때만)
  const lastBackup = await store.getLastBackupAt();
  const daysSince = lastBackup ? (Date.now() - new Date(lastBackup).getTime()) / 86400000 : Infinity;
  const backupReminder = {
    show: !!defaults.enabled && isCurrentMonth && tenants.length > 0 && daysSince >= 14,
    never: !lastBackup,
    days: Number.isFinite(daysSince) ? Math.floor(daysSince) : null,
  };

  return {
    unpaid, expiring, bankReminder, backupReminder,
    total: unpaid.length + expiring.length + (bankReminder.show ? 1 : 0) + (backupReminder.show ? 1 : 0),
  };
}

function monthsUntil(fromKey, toKey) {
  const a = parseMonth(fromKey), b = parseMonth(toKey);
  return (b.y - a.y) * 12 + (b.m - a.m);
}
