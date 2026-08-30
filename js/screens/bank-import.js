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

    const items = txns.map((t) => {
      const dup = isDup(t);
      const { suggestion } = matchDepositor(t.name, tenants);
      return { t, dup, tenantId: dup ? '' : (suggestion ? suggestion.tenant.id : ''), state: dup ? 'dup' : (suggestion ? 'auto' : 'need') };
    });

    const order = { need: 0, auto: 1, dup: 2 };
    items.sort((a, b) => order[a.state] - order[b.state] || (a.t.date < b.t.date ? -1 : 1));

    const counts = { need: items.filter((i) => i.state === 'need').length, auto: items.filter((i) => i.state === 'auto').length, dup: items.filter((i) => i.state === 'dup').length };

    const saveBtn = h('button', { class: 'btn btn--primary btn--lg' }, icon('check'), '선택한 입금 저장');
    const updateSave = () => {
      const n = items.filter((i) => i.tenantId).length;
      saveBtn.textContent = '';
      saveBtn.append(icon('check'), document.createTextNode(` 선택한 입금 ${n}건 저장`));
      saveBtn.disabled = n === 0;
    };
    saveBtn.onclick = async () => {
      const chosen = items.filter((i) => i.tenantId);
      for (const it of chosen) {
        await store.addPayment({ buildingId, tenantId: it.tenantId, month: it.t.date.slice(0, 7), amount: it.t.amount, depositorName: it.t.name, paidAt: it.t.date, source: 'bank', note: '은행파일(국민)' });
      }
      toast(`${chosen.length}건을 저장했어요`, 'ok');
      navigate('/');
    };

    const rowEl = (it) => {
      const sel = h('select', { class: 'select', style: { minHeight: '48px', fontSize: 'var(--fs-body)' }, disabled: it.dup },
        h('option', { value: '' }, it.dup ? '이미 있음' : '건너뛰기'),
        ...tenants.map((tn) => h('option', { value: tn.id, selected: it.tenantId === tn.id }, `${tn.unit}호 ${tn.name}`)));
      sel.onchange = () => { it.tenantId = sel.value; updateSave(); };
      return h('div', { class: 'card', style: it.dup ? { opacity: '.55' } : {} },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' } },
          h('div', { style: { fontWeight: 700 } }, it.t.name || '(입금자명 없음)'),
          h('div', { class: 'amount won', style: { fontWeight: 800 } }, won(it.t.amount))),
        h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)', margin: '2px 0 10px' } }, it.t.date),
        sel,
      );
    };

    clear(result);
    result.append(
      h('div', { class: 'card', style: { background: 'var(--surface-2)' } },
        h('div', { style: { fontWeight: 700, marginBottom: '6px' } }, `입금 ${txns.length}건을 찾았어요`),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
          counts.auto > 0 && h('span', { class: 'chip chip--ok' }, `자동 매칭 ${counts.auto}`),
          counts.need > 0 && h('span', { class: 'chip chip--warn' }, `확인 필요 ${counts.need}`),
          counts.dup > 0 && h('span', { class: 'chip chip--idle' }, `이미 있음 ${counts.dup}`))),
      banner('info', { text: '자동으로 맞춰둔 건 그대로 두고, “확인 필요”만 골라주면 돼요. 아닌 건 “건너뛰기”.' }),
      h('div', { class: 'stack', style: { marginTop: '12px' } }, ...items.map(rowEl)),
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
