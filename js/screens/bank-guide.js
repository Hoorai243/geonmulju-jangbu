// 은행별 거래내역(엑셀) 받는 법 안내. 메뉴 이름은 앱 버전마다 조금 다를 수 있음.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, banner } from '../ui/shell.js';
import { navigate } from '../router.js';

const GUIDES = [
  {
    bank: '국민은행 (KB스타뱅킹)', ready: true,
    steps: [
      'KB스타뱅킹 앱을 열고 로그인해요.',
      '월세 받는 계좌를 골라 “거래내역조회”로 들어가요.',
      '조회 기간을 정해요 (예: 이번 달 1일 ~ 오늘).',
      '화면 아래쪽에서 “엑셀” 또는 “파일 내보내기 / 저장”을 눌러요.',
      '파일이 저장되면 → 이 앱의 “국민은행 파일 고르기”에서 그 파일을 선택해요.',
    ],
    tip: '파일 이름은 보통 “○○○거래내역…”이에요. “최근”이나 “다운로드”에서 찾으면 돼요.',
  },
  {
    bank: '농협 · 신한 · 우리 · 하나 · 기업 등', ready: true,
    steps: [
      '은행 앱 또는 인터넷뱅킹(PC)에서 “거래내역조회”로 들어가요.',
      '기간을 정하고 “엑셀 내려받기 / 파일 저장”을 눌러요.',
      '엑셀 파일로 저장한 뒤, 이 앱에서 올려요.',
    ],
    tip: '이 은행들도 자동으로 읽어봐요(형식이 비슷해서 대부분 잡혀요). 혹시 잘 안 읽히면 그 은행 파일을 보여주시면 정확히 맞춰드릴게요.',
  },
  {
    bank: '카카오뱅크 · 토스뱅크 · 하나은행', ready: true,
    steps: [
      '앱에서 거래내역서를 “엑셀”로 받을 수 있어요 (보통 이메일로 옴).',
      '단, 카카오·토스가 주는 엑셀은 비밀번호로 잠겨 있어요 (보통 생년월일 6자리).',
      '컴퓨터 엑셀에서 열어(비번 입력) → “다른 이름으로 저장”할 때 비밀번호 없이 저장 → 그 파일을 올려요.',
    ],
    tip: '잠긴 엑셀은 바로 못 읽어요. 잠금을 풀어(비번 없이 다시 저장) 올리면 읽혀요. 하나은행은 잠기지 않은 경우가 많아 그대로 될 수 있어요.',
  },
];

export async function renderBankGuide() {
  return screen({ plain: true },
    topbar({ title: '거래내역 받는 법', back: '/bank-import' }),
    h('div', { class: 'stack-lg' },
      banner('info', { text: '거래내역을 “엑셀(.xls/.xlsx)” 또는 “CSV” 파일로 받아야 읽을 수 있어요. 메뉴 이름은 앱 버전마다 조금 다를 수 있어요.' }),
      ...GUIDES.map((g) => h('div', { class: 'card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
          icon('bank', { cls: '' }),
          h('div', { style: { fontWeight: 800, fontSize: 'var(--fs-lg)' } }, g.bank),
          g.ready ? h('span', { class: 'chip chip--ok', style: { marginLeft: 'auto' } }, '자동 인식') : h('span', { class: 'chip chip--idle', style: { marginLeft: 'auto' } }, '엑셀 필요')),
        h('ol', { style: { margin: '0 0 0 4px', paddingLeft: '20px', lineHeight: '1.7' } }, ...g.steps.map((s) => h('li', { style: { marginBottom: '6px' } }, s))),
        h('div', { class: 'banner banner--info', style: { marginTop: '12px' } }, icon('info'), h('div', {}, g.tip)),
      )),
      h('button', { class: 'btn btn--primary btn--lg', onClick: () => navigate('/bank-import') }, icon('download'), '파일 올리러 가기'),
    ),
  );
}
