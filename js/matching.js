// 느슨한 이름 매칭 — 통장에 찍힌 입금자명을 등록된 세입자와 비교해 후보 제안.
// 사람 이름은 짧아서 "포함/유사도"를 함께 본다.

function norm(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

// 편집거리(레벤슈타인)
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[m][n];
}
function ratio(a, b) {
  if (!a || !b) return 0;
  const d = lev(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

// 입금자명과 세입자 1명의 점수(0~1)
function scoreTenant(depositor, tenant) {
  const d = norm(depositor);
  const cand = [norm(tenant.name), norm(tenant.businessName)].filter(Boolean);
  let best = 0;
  for (const c of cand) {
    if (!c) continue;
    let s;
    if (c === d) s = 1;
    else if (d.includes(c) || c.includes(d)) s = 0.9;      // 상호+이름 함께 입금 등
    else s = ratio(c, d);
    if (s > best) best = s;
  }
  return best;
}

// 후보 목록 반환(점수 높은 순). suggestion = 자신 있게 제안할 1명(있으면).
export function matchDepositor(depositor, tenants) {
  const active = tenants.filter((t) => t.status !== 'movedout');
  const scored = active
    .map((t) => ({ tenant: t, score: scoreTenant(depositor, t) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  let suggestion = null;
  if (top && top.score >= 0.6) {
    // 2등과 충분히 차이 나거나 완전 일치일 때만 자동 제안
    if (top.score >= 0.9 || !second || top.score - second.score >= 0.2) suggestion = top;
  }
  return { suggestion, candidates: scored };
}
