// 세입자 등록/수정 화면.
import { h, toast, attachAmountFormat, parseNum, monthKey } from '../util.js';
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

  const save = async () => {
    if (!unit.value.trim()) return toast('호실 번호를 입력해 주세요.', 'bad');
    if (!name.value.trim()) return toast('세입자 이름을 입력해 주세요.', 'bad');
    const data = {
      id: t?.id, buildingId,
      unit: unit.value, name: name.value, kind,
      businessName: kind === 'shop' ? businessName.value : '',
      bizNo: kind === 'shop' ? bizNo.value : '',
      phone: phone.value,
      deposit: parseNum(deposit.value),
      dueDay: Number(dueDay.value),
      contractStart: contractStart.value || monthKey(),
      contractEnd: contractEnd.value || '',
      rent: parseNum(rent.value), fee: parseNum(fee.value),
    };
    const saved = await store.saveTenant(data);
    // 기본 요금 동기화(수정 시)
    if (editing && baseFrom) await store.changeRates(saved.id, { from: baseFrom, rent: data.rent, fee: data.fee });
    toast(editing ? '수정했어요' : '세입자를 등록했어요', 'ok');
    navigate('/tenant/' + saved.id, { replace: true });
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
      )); return shopFields; })(),
      field('휴대폰 번호', phone, '선택', '미납 안내 문자를 보낼 때만 써요. (주민번호·계좌번호는 받지 않아요)'),
      banner('info', { text: '관리비에는 수도세·전기세를 포함해 매달 고정 금액으로 넣어요. 나중에 달라지면 “요금 변경”으로 바꿀 수 있어요.' }),
      field('월세', suffixWon(rent)),
      field('관리비 (수도·전기 포함)', suffixWon(fee)),
      field('보증금', suffixWon(deposit), '선택'),
      field('계약 시작월', contractStart),
      field('계약 만료월', contractEnd, '선택'),
      field('납기일', dueDay, null, '이 날짜에서 3일이 지나도록 입금이 없으면 “미납(빨강)”으로 표시돼요.'),
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
