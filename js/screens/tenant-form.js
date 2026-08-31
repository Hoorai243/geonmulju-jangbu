// 세입자 등록/수정 화면.
import { h, toast, attachAmountFormat, parseNum, monthKey, confirmSheet } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, banner } from '../ui/shell.js';
import * as store from '../store.js';
import { navigate } from '../router.js';

export async function renderTenantForm({ params }) {
  const editing = !!params.id;
  const t = editing ? await store.getTenant(params.id) : null;
  const buildingId = t ? t.buildingId : await store.getCurrentBuildingId();
  const baseRate = t ? store.ratesForMonth(t, t.rentHistory?.[0]?.from || t.contractStart) : { rent: 0, fee: 0 };
  const baseFrom = t ? (t.rentHistory?.[0]?.from || t.contractStart) : null;

  // 입력 요소
  const unit = h('input', { class: 'input', placeholder: '예: 101, 201, B1', value: t?.unit || '', inputmode: 'text' });
  const name = h('input', { class: 'input', placeholder: '세입자 이름', value: t?.name || '' });
  let kind = t?.kind || 'house';
  const houseBtn = h('button', { type: 'button', class: 'choice__opt' + (kind === 'house' ? ' choice__opt--on' : '') }, icon('home'), '주택');
  const shopBtn = h('button', { type: 'button', class: 'choice__opt' + (kind === 'shop' ? ' choice__opt--on' : '') }, icon('building'), '상가');
  const shopFields = h('div');
  const setKind = (k) => {
    kind = k;
    houseBtn.classList.toggle('choice__opt--on', k === 'house');
    shopBtn.classList.toggle('choice__opt--on', k === 'shop');
    shopFields.style.display = k === 'shop' ? 'block' : 'none';
  };
  houseBtn.onclick = () => setKind('house');
  shopBtn.onclick = () => setKind('shop');

  const businessName = h('input', { class: 'input', placeholder: '예: ○○카페 (선택)', value: t?.businessName || '' });
  const bizNo = h('input', { class: 'input', placeholder: '예: 123-45-67890 (선택)', value: t?.bizNo || '', inputmode: 'numeric' });
  const vatCb = h('input', { type: 'checkbox', checked: !!t?.vat });
  const vatSwitch = h('label', { class: 'switch' }, vatCb, h('span', { class: 'switch__track' }));
  const phone = h('input', { class: 'input', type: 'tel', placeholder: '010-0000-0000 (선택)', value: t?.phone || '', inputmode: 'numeric' });

  const rent = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', placeholder: '0', value: baseRate.rent ? baseRate.rent.toLocaleString('ko-KR') : '' }));
  const fee = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', placeholder: '0', value: baseRate.fee ? baseRate.fee.toLocaleString('ko-KR') : '' }));
  const deposit = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', placeholder: '0', value: t?.deposit ? t.deposit.toLocaleString('ko-KR') : '' }));

  const contractStart = h('input', { class: 'input', type: 'month', value: t?.contractStart || monthKey() });
  const contractEnd = h('input', { class: 'input', type: 'month', value: t?.contractEnd || '' });
  const dueDay = h('select', { class: 'select' },
    ...Array.from({ length: 28 }, (_, i) => h('option', { value: String(i + 1), selected: (t?.dueDay || 1) === i + 1 }, `매월 ${i + 1}일`)));

  setKind(kind);

  const suffixWon = (input) => h('div', { class: 'input-suffix' }, input, h('span', { class: 'suffix' }, '원'));

  // 수도세를 관리비와 다른 주기(예: 관리비 매월·수도세 격월)로 받을 때만 쓰는 옵션.
  // 지금은 모든 세입자가 수도세를 관리비에 합쳐 받아서 화면에서 숨김.
  // 다시 필요하면 이 값을 true 로 바꾸면 등록 화면에 스위치가 돌아옴. (저장 로직·데이터는 그대로 유지)
  const SHOW_WATER_SEPARATE = false;

  // ----- 수도세 따로 받기 (매월/격월) -----
  const wc = t ? store.waterConfig(t, baseFrom) : { amount: 0, cycle: 'none', parity: 'odd' };
  let waterCycle = wc.cycle === 'none' ? 'monthly' : wc.cycle; // 켰을 때 기본 매월
  let waterParity = wc.parity || 'odd';
  const waterAmount = attachAmountFormat(h('input', { class: 'input input--amount', inputmode: 'numeric', placeholder: '0', value: wc.amount ? wc.amount.toLocaleString('ko-KR') : '' }));
  const waterCb = h('input', { type: 'checkbox', checked: wc.cycle !== 'none' });
  const waterSwitch = h('label', { class: 'switch' }, waterCb, h('span', { class: 'switch__track' }));

  const cycleMonthly = h('button', { type: 'button', class: 'choice__opt' }, '매월');
  const cycleBi = h('button', { type: 'button', class: 'choice__opt' }, '격월');
  const parityOdd = h('button', { type: 'button', class: 'choice__opt' }, '홀수 달');
  const parityEven = h('button', { type: 'button', class: 'choice__opt' }, '짝수 달');
  const parityField = field('언제 받나요', h('div', { class: 'choice' }, parityOdd, parityEven), null, '격월이면 이 달들에만 수도세가 붙어요. (홀수 달 = 1·3·5·7·9·11월)');
  const waterDetails = h('div', { class: 'stack', style: { marginTop: '16px' } },
    field('한 번 낼 수도세', suffixWon(waterAmount)),
    field('수도세 주기', h('div', { class: 'choice' }, cycleMonthly, cycleBi)),
    parityField,
    h('p', { class: 'hint' }, '※ 수도세를 따로 받으면, 위 “관리비”에는 수도세를 빼고 적어 주세요.'),
  );
  const renderCycle = () => {
    cycleMonthly.classList.toggle('choice__opt--on', waterCycle === 'monthly');
    cycleBi.classList.toggle('choice__opt--on', waterCycle === 'bimonthly');
    parityField.style.display = waterCycle === 'bimonthly' ? 'block' : 'none';
  };
  const renderParity = () => {
    parityOdd.classList.toggle('choice__opt--on', waterParity === 'odd');
    parityEven.classList.toggle('choice__opt--on', waterParity === 'even');
  };
  const renderWater = () => { waterDetails.style.display = waterCb.checked ? 'block' : 'none'; renderCycle(); renderParity(); };
  cycleMonthly.onclick = () => { waterCycle = 'monthly'; renderCycle(); };
  cycleBi.onclick = () => { waterCycle = 'bimonthly'; renderCycle(); };
  parityOdd.onclick = () => { waterParity = 'odd'; renderParity(); };
  parityEven.onclick = () => { waterParity = 'even'; renderParity(); };
  waterCb.onchange = renderWater;
  renderWater();

  // ----- 관리비 주기(매월/격월) -----
  const fc = t ? store.feeConfig(t, baseFrom) : { cycle: 'monthly', parity: 'odd' };
  let feeCycle = fc.cycle, feeParity = fc.parity;
  const feeM = h('button', { type: 'button', class: 'choice__opt' }, '매월');
  const feeB = h('button', { type: 'button', class: 'choice__opt' }, '격월');
  const feePO = h('button', { type: 'button', class: 'choice__opt' }, '홀수 달');
  const feePE = h('button', { type: 'button', class: 'choice__opt' }, '짝수 달');
  const feeParityField = field('관리비 언제', h('div', { class: 'choice' }, feePO, feePE), null, '격월이면 이 달들에만 관리비가 붙어요. (홀수 달 = 1·3·5·7·9·11월)');
  const feeCycleBlock = h('div', { class: 'stack', style: { marginTop: '4px' } },
    field('관리비 주기', h('div', { class: 'choice' }, feeM, feeB)), feeParityField);
  const fcRC = () => { feeM.classList.toggle('choice__opt--on', feeCycle === 'monthly'); feeB.classList.toggle('choice__opt--on', feeCycle === 'bimonthly'); feeParityField.style.display = feeCycle === 'bimonthly' ? 'block' : 'none'; };
  const fcRP = () => { feePO.classList.toggle('choice__opt--on', feeParity === 'odd'); feePE.classList.toggle('choice__opt--on', feeParity === 'even'); };
  feeM.onclick = () => { feeCycle = 'monthly'; fcRC(); };
  feeB.onclick = () => { feeCycle = 'bimonthly'; fcRC(); };
  feePO.onclick = () => { feeParity = 'odd'; fcRP(); };
  feePE.onclick = () => { feeParity = 'even'; fcRP(); };
  fcRC(); fcRP();

  const save = async () => {
    if (!unit.value.trim()) return toast('호실 번호를 입력해 주세요.', 'bad');
    if (!name.value.trim()) return toast('세입자 이름을 입력해 주세요.', 'bad');
    // 계약 만료월이 시작월보다 빠르면 막음(실수 방지)
    if (contractStart.value && contractEnd.value && contractEnd.value < contractStart.value)
      return toast('계약 만료월이 시작월보다 빨라요. 다시 확인해 주세요.', 'bad');
    const data = {
      id: t?.id, buildingId,
      unit: unit.value, name: name.value, kind,
      businessName: kind === 'shop' ? businessName.value : '',
      bizNo: kind === 'shop' ? bizNo.value : '',
      vat: kind === 'shop' ? vatCb.checked : false,
      phone: phone.value,
      deposit: parseNum(deposit.value),
      dueDay: Number(dueDay.value),
      contractStart: contractStart.value || monthKey(),
      contractEnd: contractEnd.value || '',
      rent: parseNum(rent.value), fee: parseNum(fee.value),
      feeCycle, feeParity,
      water: waterCb.checked ? parseNum(waterAmount.value) : 0,
      waterCycle: waterCb.checked ? waterCycle : 'none',
      waterParity,
    };
    const doSave = async () => {
      const saved = await store.saveTenant(data);
      // 기본 요금 동기화(수정 시)
      if (editing && baseFrom) await store.changeRates(saved.id, { from: baseFrom, rent: data.rent, fee: data.fee, feeCycle: data.feeCycle, feeParity: data.feeParity, water: data.water, waterCycle: data.waterCycle, waterParity: data.waterParity });
      toast(editing ? '수정했어요' : '세입자를 등록했어요', 'ok');
      navigate('/tenant/' + saved.id, { replace: true });
    };
    // 같은 호실이 이미 있으면 한 번 더 확인(실수 방지)
    const others = (await store.getTenants(buildingId)).filter((x) => x.status !== 'movedout' && x.id !== t?.id);
    if (others.some((x) => (x.unit || '').trim() === unit.value.trim())) {
      confirmSheet({ title: '같은 호실이 이미 있어요', desc: `${unit.value.trim()}호로 등록된 세입자가 이미 있어요. 그래도 저장할까요?`, confirmText: '그대로 저장', onConfirm: doSave });
      return;
    }
    await doSave();
  };

  return screen({ plain: true },
    topbar({ title: editing ? '세입자 수정' : '세입자 등록', back: editing ? '/tenant/' + t.id : '/tenants' }),
    h('div', { class: 'stack' },
      field('호실 번호', unit),
      field('세입자 이름', name),
      field('종류', h('div', { class: 'choice' }, houseBtn, shopBtn)),
      // 상가 전용
      (() => { shopFields.appendChild(h('div', { class: 'stack' },
        field('사업 이름', businessName, '선택'),
        field('사업자등록번호', bizNo, '선택'),
        h('div', { class: 'card' },
          h('div', { class: 'settingrow', style: { padding: 0 } },
            h('div', { class: 'settingrow__main' },
              h('div', { class: 'settingrow__title' }, '부가세 받기 (세금계산서)'),
              h('div', { class: 'settingrow__desc' }, '켜면 월세·관리비에 부가세 10%를 더해 청구하고, 세금계산서 정리에 넣어요')),
            vatSwitch)),
      )); return shopFields; })(),
      field('휴대폰 번호', phone, '선택', '미납 안내 문자를 보낼 때만 써요. (주민번호·계좌번호는 받지 않아요)'),
      banner('info', { text: '관리비에는 수도세·전기세를 포함해 매달 고정 금액으로 넣어요. 나중에 달라지면 “요금 변경”으로 바꿀 수 있어요.' }),
      field('월세', suffixWon(rent)),
      field('관리비 (전기 등 포함)', suffixWon(fee)),
      feeCycleBlock,
      field('보증금', suffixWon(deposit), '선택'),
      field('계약 시작월', contractStart),
      field('계약 만료월', contractEnd, '선택'),
      field('납기일', dueDay, null, '이 날짜에서 3일이 지나도록 입금이 없으면 “미납(빨강)”으로 표시돼요.'),
      // 수도세 따로 받기 (기본 숨김. 이미 수도세가 켜진 세입자만 계속 보여 끌 수 있게 함)
      (SHOW_WATER_SEPARATE || wc.cycle !== 'none') && h('div', { class: 'card' },
        h('div', { class: 'settingrow', style: { padding: 0 } },
          h('div', { class: 'settingrow__main' },
            h('div', { class: 'settingrow__title' }, '수도세 따로 받기'),
            h('div', { class: 'settingrow__desc' }, '매월 또는 격월(2개월에 한 번)로 받을 수 있어요')),
          waterSwitch),
        waterDetails,
      ),
      h('button', { class: 'btn btn--primary btn--lg', onClick: save }, editing ? '수정 저장' : '등록하기'),
      h('div', { style: { height: '12px' } }),
    ),
  );
}

function field(label, control, optional, hint) {
  return h('div', { class: 'field' },
    h('label', { class: 'label' }, label, optional && h('span', { class: 'optional' }, ' (' + optional + ')')),
    hint && h('p', { class: 'hint' }, hint),
    control,
  );
}
