// 도움말 — 자주 헷갈리는 "되돌리기" 방법을 자세히 안내.
import { h, toast } from '../util.js';
import { icon } from '../icons.js';
import { screen, topbar, banner } from '../ui/shell.js';
import { resetCoaches } from '../ui/coach.js';
import { navigate } from '../router.js';

const GUIDES = [
  {
    title: '입금을 잘못 넣었을 때 되돌리기',
    steps: [
      '아래 “현황” 화면으로 가요.',
      '되돌릴 세입자 줄에서, 왼쪽의 색칠된 네모(체크 표시)를 눌러요. — 완납이면 초록, 부분납부면 노랑이에요.',
      '“○월 입금 내역”이 떠요. 되돌릴 입금 오른쪽의 휴지통 아이콘을 눌러요.',
      '“직접 입력” 표시가 있는 건 바로 되돌려지고, “은행 확인” 표시가 있는 건 “그래도 지울까요?”에서 [지우기]를 눌러요.',
    ],
    tip: '네모가 회색(미확인)이나 빨강(미납)이면 아직 입금 기록이 없어서 되돌릴 게 없어요. 그 세입자 이름 쪽을 누르면 상세 화면으로 가요.',
  },
  {
    title: '퇴거를 잘못 눌렀을 때 되돌리기',
    steps: [
      '“세입자” 화면에서 그 세입자를 눌러요. (퇴거한 세입자는 목록 아래쪽 “퇴거한 세입자”에 있어요)',
      '맨 위 “퇴거한 세입자예요” 안내 아래의 “퇴거 취소 (다시 활성)” 버튼을 눌러요.',
      '다시 이번 달 현황에 나와요.',
    ],
    tip: '퇴거는 되돌릴 수 있어요. 실수로 여러 번 눌러도 걱정 없어요.',
  },
  {
    title: '삭제는 왜 지문/비밀번호를 물어보나요',
    steps: [
      '세입자 삭제, 백업 불러오기처럼 “되돌릴 수 없는” 동작은 지문이나 비밀번호를 한 번 더 확인해요.',
      '실수로 눌러도 바로 지워지지 않게 하는 안전장치예요.',
    ],
    tip: '입금 되돌리기(위)는 안전해서 확인을 묻지 않아요. 세입자 통째로 삭제할 때만 물어봐요.',
  },
];

export async function renderHelp() {
  return screen({ plain: true },
    topbar({ title: '도움말', back: '/more' }),
    h('div', { class: 'stack-lg' },
      banner('info', { text: '헷갈리기 쉬운 “되돌리기” 방법을 모아뒀어요. 실수해도 대부분 되돌릴 수 있으니 안심하세요.' }),
      ...GUIDES.map((g) => h('div', { class: 'card' },
        h('div', { style: { fontWeight: 800, fontSize: 'var(--fs-lg)', marginBottom: '12px' } }, g.title),
        h('ol', { style: { margin: 0, paddingLeft: '22px', lineHeight: '1.8' } }, ...g.steps.map((s) => h('li', { style: { marginBottom: '8px' } }, s))),
        h('div', { class: 'banner banner--info', style: { marginTop: '12px' } }, icon('info'), h('div', {}, g.tip)),
      )),
      h('div', { class: 'card' },
        h('div', { style: { fontWeight: 800, fontSize: 'var(--fs-lg)', marginBottom: '8px' } }, '따라하기 안내 다시 보기'),
        h('div', { class: 'muted', style: { marginBottom: '12px', lineHeight: '1.6' } }, '처음에 화면에서 알려줬던 “여기를 누르세요” 안내를 다시 보고 싶으면 눌러요.'),
        h('button', { class: 'btn btn--secondary btn--lg', onClick: async () => { await resetCoaches(); toast('안내를 다시 볼 수 있어요', 'ok'); navigate('/'); } }, icon('info'), '따라하기 안내 다시 켜기'),
      ),
      h('div', { style: { height: '12px' } }),
    ),
  );
}
