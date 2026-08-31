// 은행별 거래내역(엑셀) 받는 법 안내. 메뉴 이름은 앱 버전마다 조금 다를 수 있음.
import { h } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, banner } from '../ui/shell.js';
import { navigate } from '../router.js';

const GUIDES = [
  {
    bank: '국민은행 (KB) — 엑셀은 PC에서', ready: true,
    steps: [
      '엑셀은 “PC 인터넷뱅킹”에서 받아요. (KB스타뱅킹 폰 앱은 거래내역을 PDF·이미지로만 줘서, 이 앱이 못 읽어요)',
      'PC에서 KB국민은행 인터넷뱅킹(obank.kbstar.com)에 접속 → 인증서(공동·금융·KB인증서)로 로그인해요.',
      '상단 [조회] → [거래내역조회]를 눌러요.',
      '월세 받는 계좌를 고르고, 조회 기간을 정해요 (예: 이번 달 1일 ~ 오늘) → [조회].',
      '조회 결과 화면에서 “엑셀저장”을 눌러 파일을 내려받아요.',
      '그 엑셀 파일을 이 앱의 “거래내역 파일 고르기”에서 선택해요.',
    ],
    tip: '폰만 있고 PC가 없으면: 앱에서 PDF로는 저장되지만 이 앱은 PDF를 못 읽어요. 꼭 PC 인터넷뱅킹의 “엑셀저장”으로 받아 주세요. (은행 화면은 업데이트로 메뉴 위치·이름이 조금 바뀔 수 있어요)',
  },
  {
    bank: '기업은행 (i-ONE / 인터넷뱅킹)', ready: true,
    steps: [
      '엑셀은 앱이 아니라 “PC 인터넷뱅킹”에서 받아요. (앱 i-ONE뱅크는 PDF만 줘요)',
      'PC에서 IBK기업은행 로그인 → [조회] → [거래내역조회] → 계좌·기간 선택 → [조회].',
      '저장 버튼이 두 개예요 — 위쪽 “엑셀저장”은 보기·출력용, 아래 “파일저장”은 데이터 재사용용.',
      '우리 앱에 넣을 거면 아래 “파일저장”(데이터 재사용용)으로 받는 걸 추천해요. 그 파일을 올리세요.',
    ],
    tip: '“엑셀저장(출력용)”은 제목·서식이 들어가 가끔 잘못 읽혀요. 잘 안 읽히면 다른 버튼으로 받은 파일로 다시 시도하세요. 앱 PDF는 못 읽어요.',
  },
  {
    bank: '농협 · 신한 · 우리 · 하나 등', ready: true,
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

const TRANSFER = {
  steps: [
    '카카오톡 “나에게 보내기”(제일 쉬움) — 컴퓨터 카톡에서 나와의 채팅에 엑셀 파일을 끌어다 놓고, 폰 카톡에서 그 파일을 “저장”해요.',
    '이메일 — 컴퓨터에서 내 메일로 파일을 첨부해 보내고, 폰 메일 앱에서 첨부파일을 저장해요.',
    'USB 케이블 — 폰을 컴퓨터에 연결해 폰의 “Download(다운로드)” 폴더에 파일을 복사해요.',
    '옮긴 뒤, 이 앱에서 “거래내역 파일 고르기”를 누르고 방금 저장한 곳(보통 “다운로드”)에서 그 파일을 고르면 돼요.',
  ],
  tip: '카톡으로 받은 파일은 폰의 “다운로드” 또는 “KakaoTalk” 폴더에 있어요. 파일 이름에 “거래내역”이 들어가 있으면 그거예요.',
};

export async function renderBankGuide() {
  return screen({ plain: true },
    topbar({ title: '거래내역 받는 법', back: '/bank-import' }),
    h('div', { class: 'stack-lg' },
      banner('info', { text: '거래내역을 “엑셀(.xls/.xlsx)” 또는 “CSV” 파일로 받아야 읽을 수 있어요. 메뉴 이름은 앱 버전마다 조금 다를 수 있어요.' }),

      // 컴퓨터에서 받은 파일을 폰으로 옮기는 법 (KB·기업은행은 PC에서 엑셀을 받으므로 필요)
      h('div', { class: 'card', style: { borderColor: 'var(--primary)', borderWidth: '2px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } },
          icon('phone', { cls: '' }),
          h('div', { style: { fontWeight: 800, fontSize: 'var(--fs-lg)' } }, '컴퓨터 파일을 폰으로 옮기기'),
          h('span', { class: 'chip chip--ok', style: { marginLeft: 'auto' } }, '편한 것 하나')),
        h('ol', { style: { margin: '0 0 0 4px', paddingLeft: '20px', lineHeight: '1.7' } }, ...TRANSFER.steps.map((s) => h('li', { style: { marginBottom: '6px' } }, s))),
        h('div', { class: 'banner banner--info', style: { marginTop: '12px' } }, icon('info'), h('div', {}, TRANSFER.tip)),
      ),
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
