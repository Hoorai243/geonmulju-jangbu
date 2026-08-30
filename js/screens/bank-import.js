// 은행 거래내역 파일로 입금 정리 — 파일 고르기 → 입금만 뽑아 자동 매칭 → 확인 후 저장.
import { h, won, clear, toast } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, banner, emptyState } from '../ui/shell.js';
import * as store from '../store.js';
import { matchDepositor } from '../matching.js';
import { readBankFile } from '../bank/import.js';
import { navigate } from '../router.js';

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

export async function renderBankImport() {
  const buildingId = await store.getCurrentBuildingId();
  const tenants = (await store.getTenants(buildingId)).filter((t) => t.status !== 'movedout');

  const result = h('div');
  const fileInput = h('input', { type: 'file', accept: '.xls,.xlsx,.csv', style: { display: 'none' } });
  const status = h('div', { class: 'muted center', style: { padding: '8px' } });

  async function process(file, password) {
    clear(result);
    status.textContent = password ? '잠금을 푸는 중…' : '파일을 읽는 중…';
    try {
      const txns = await readBankFile(file, { password });
      status.textContent = '';
      if (!txns.length) { clear(result).appendChild(banner('warn', { title: '입금 내역이 없어요', text: '이 파일에서 “입금” 거래를 못 찾았어요. 엑셀로 받은 거래내역 파일이 맞는지 확인해 주세요.' })); return; }
      await review(txns);
    } catch (e) {
      status.textContent = '';
      if (e.code === 'PW_REQUIRED' || e.code === 'PW_WRONG') { showPasswordPrompt(file, e.code === 'PW_WRONG'); return; }
      if (e.code === 'ENCRYPTED') { showEncryptedHelp(); return; }
      clear(result).appendChild(banner('bad', { title: '읽지 못했어요', text: e.message || '파일을 읽을 수 없어요.' }));
    }
  }

  function showPasswordPrompt(file, wrong) {
    const pw = h('input', { class: 'input', type: 'password', inputmode: 'numeric', placeholder: '예: 생년월일 6자리 (901231)' });
    const open = () => { const v = pw.value.trim(); if (!v) return toast('파일 비밀번호를 입력해 주세요.', 'bad'); process(file, v); };
    pw.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
    clear(result).appendChild(h('div', { class: 'card stack' },
      banner(wrong ? 'bad' : 'info', { title: wrong ? '비밀번호가 맞지 않아요' : '이 파일은 비밀번호로 잠겨 있어요', text: '토스·카카오뱅크 등이 보내는 엑셀은 비밀번호로 잠겨 있어요. 보통 생년월일 6자리예요. 비밀번호는 이 기기에서만 쓰이고 어디에도 보내지 않아요.' }),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', { class: 'label' }, '파일 비밀번호'), pw),
      h('button', { class: 'btn btn--primary btn--lg', onClick: open }, icon('lock'), '잠금 풀고 열기'),
    ));
    setTimeout(() => pw.focus(), 100);
  }

  // 잠긴(암호화된) 파일 — 토스·카카오 등. 비밀번호 없이 다시 저장해서 올리도록 안내.
  function showEncryptedHelp() {
    clear(result).appendChild(h('div', { class: 'card stack' },
      banner('warn', { title: '이 파일은 비밀번호로 잠겨 있어요', text: '토스·카카오뱅크 등이 보내는 엑셀은 잠겨 있어서 지금은 바로 못 읽어요. 아래처럼 잠금을 풀어 다시 올려 주세요.' }),
      h('ol', { style: { margin: 0, paddingLeft: '20px', lineHeight: '1.8' } },
        h('li', {}, '받은 엑셀 파일을 열어요 (비밀번호는 보통 생년월일 6자리).'),
        h('li', {}, '컴퓨터 엑셀에서 “다른 이름으로 저장” → 저장할 때 비밀번호를 넣지 말고 저장해요.'),
        h('li', {}, '그렇게 저장한 파일을 여기 다시 올려요.')),
      banner('info', { text: '국민은행처럼 잠기지 않은 엑셀을 주는 은행 파일은 이 과정 없이 바로 읽혀요.' }),
    ));
  }

  fileInput.onchange = () => { const f = fileInput.files[0]; if (f) process(f); fileInput.value = ''; };

  async function review(txns) {
    if (!tenants.length) { result.appendChild(banner('info', { text: '먼저 세입자를 등록해 주세요.' })); return; }
    const existing = await store.getAllPaymentsForBuilding(buildingId);
    const isDup = (t) => existing.some((p) => p.paidAt === t.date && p.amount === t.amount && norm(p.depositorName) === norm(t.name));
    const rules = await store.getMatchRules(buildingId);

    // 입금자명으로 묶기 (같은 이름은 한 덩어리)
    const map = new Map();
    for (const t of txns) {
      const key = norm(t.name) || '__빈칸__';
      if (!map.has(key)) map.set(key, { key, display: t.name || '(입금자명 없음)', live: [], dup: [] });
      (isDup(t) ? map.get(key).dup : map.get(key).live).push(t);
    }
    const groups = [...map.values()];
    // 초기 결정: 기억한 별칭 → 제외 목록 → 느슨한 매칭
    for (const g of groups) {
      let d = '';
      if (rules.aliases[g.key] && tenants.find((t) => t.id === rules.aliases[g.key])) d = rules.aliases[g.key];
      else if (rules.ignores.includes(g.key)) d = 'ignore';
      else { const { suggestion } = matchDepositor(g.display, tenants); if (suggestion) d = suggestion.tenant.id; }
      g.decision = d;
      g.sum = [...g.live, ...g.dup].reduce((s, x) => s + x.amount, 0);
    }
    const rank = (g) => (g.live.length === 0 ? 3 : g.decision === '' ? 0 : g.decision === 'ignore' ? 2 : 1);
    groups.sort((a, b) => rank(a) - rank(b) || b.sum - a.sum);

    const dupTotal = txns.filter((t) => isDup(t)).length;

    const saveBtn = h('button', { class: 'btn btn--primary btn--lg' });
    const updateSave = () => {
      let n = 0; for (const g of groups) if (g.decision && g.decision !== 'ignore') n += g.live.length;
      clear(saveBtn).append(icon('check'), document.createTextNode(` 선택한 입금 ${n}건 저장`));
      saveBtn.disabled = n === 0;
    };
    saveBtn.onclick = async () => {
      const rules2 = await store.getMatchRules(buildingId);
      let saved = 0;
      for (const g of groups) {
        if (g.decision === 'ignore') { if (!rules2.ignores.includes(g.key)) rules2.ignores.push(g.key); }
        else if (g.decision) {
          rules2.aliases[g.key] = g.decision; // 다음에도 기억
          for (const t of g.live) { await store.addPayment({ buildingId, tenantId: g.decision, month: t.date.slice(0, 7), amount: t.amount, depositorName: t.name, paidAt: t.date, source: 'bank', note: '은행파일' }); saved++; }
        }
      }
      await store.saveMatchRules(buildingId, rules2);
      toast(`${saved}건을 저장했어요`, 'ok');
      navigate('/');
    };

    const groupEl = (g) => {
      const onlyDup = g.live.length === 0;
      const sel = h('select', { class: 'select', style: { minHeight: '52px', fontSize: 'var(--fs-body)' }, disabled: onlyDup },
        h('option', { value: '', selected: g.decision === '' }, onlyDup ? '이미 있음 (모두)' : '건너뛰기 (이번만)'),
        h('option', { value: 'ignore', selected: g.decision === 'ignore' }, '제외 (앞으로 계속)'),
        ...tenants.map((tn) => h('option', { value: tn.id, selected: g.decision === tn.id }, `${tn.unit}호 ${tn.name}`)));
      sel.onchange = () => { g.decision = sel.value; updateSave(); };
      const badge = onlyDup ? h('span', { class: 'chip chip--idle' }, '이미 있음')
        : g.decision && g.decision !== 'ignore' ? h('span', { class: 'chip chip--ok' }, '연결됨')
          : g.decision === 'ignore' ? h('span', { class: 'chip chip--idle' }, '제외')
            : h('span', { class: 'chip chip--warn' }, '확인 필요');
      return h('div', { class: 'card', style: onlyDup ? { opacity: '.6' } : {} },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' } },
          h('div', { style: { fontWeight: 700 } }, g.display), badge),
        h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)', margin: '2px 0 10px' } },
          `${g.live.length + g.dup.length}건 · 합계 ${won(g.sum)}원` + (g.dup.length ? ` (이미 ${g.dup.length}건 저장됨)` : '')),
        sel,
      );
    };

    clear(result);
    result.append(
      h('div', { class: 'card', style: { background: 'var(--surface-2)' } },
        h('div', { style: { fontWeight: 700, marginBottom: '6px' } }, `입금 ${txns.length}건 · 입금자 ${groups.length}명`),
        h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, '같은 이름은 한 번만 정하면 그 이름 전부에 적용돼요. 한 번 정한 이름은 다음에도 자동으로 기억해요.')),
      banner('info', { text: '“확인 필요”만 골라주면 돼요. 세입자 이름과 달라도 이 세입자로 지정하면 다음부터 자동 연결돼요. 필요 없는 입금은 “제외”.' }),
      dupTotal > 0 && h('div', { class: 'muted center', style: { fontSize: 'var(--fs-sm)' } }, `이미 저장된 ${dupTotal}건은 자동으로 건너뛰어요.`),
      h('div', { class: 'stack', style: { marginTop: '12px' } }, ...groups.map(groupEl)),
      h('div', { style: { position: 'sticky', bottom: '0', padding: '12px 0', background: 'linear-gradient(transparent, var(--paper) 30%)' } }, saveBtn),
    );
    updateSave();
  }

  return screen({ plain: true },
    topbar({ title: '은행 파일로 정리', back: '/more' }),
    h('div', { class: 'stack-lg' },
      banner('info', { title: '은행 거래내역 파일 올리기', text: '엑셀(.xls/.xlsx)·CSV로 받은 거래내역을 올리면, 입금만 뽑아 세입자에 자동으로 붙여드려요. 국민은행은 검증됐고, 다른 은행도 자동으로 인식해봐요. (PDF·사진은 아직 못 읽어요)' }),
      fileInput,
      h('button', { class: 'btn btn--primary btn--lg', onClick: () => fileInput.click() }, icon('download'), '거래내역 파일 고르기'),
      h('button', { class: 'btn btn--ghost', onClick: () => navigate('/bank-guide') }, icon('info'), '거래내역 파일 받는 법 보기'),
      status,
      result,
    ),
  );
}
