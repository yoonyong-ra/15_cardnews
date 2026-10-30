const assert = require('assert');
const { validateCardScript } = require('../engine/script_validator');

let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

function validScript() {
  return {
    category: '손실회피 · 테스트',
    slides: [
      {
        slide_number: 1,
        total_slides: 4,
        type: 'cover',
        tagline: '🚨 긴급 점검',
        headline_prefix: '모르면',
        headline_highlight: '보증금',
        headline_suffix: '날립니다',
        image_caption: '표지 설명',
        swipe_text: '밀어서 보기'
      },
      {
        slide_number: 2,
        total_slides: 4,
        type: 'body_list',
        step_badge: 'CHECK 01',
        title: '계약 전 확인할 3가지',
        points: [{ number: '01', heading: '등기부 확인', desc: '근저당을 먼저 확인합니다.' }]
      },
      {
        slide_number: 3,
        total_slides: 4,
        type: 'body_visual',
        step_badge: 'ACTION 02',
        title: '특약 문구 예시',
        points: [{ number: 'KEY', heading: '반환 특약', desc: '대출 불가 시 계약금 반환.' }]
      },
      {
        slide_number: 4,
        total_slides: 4,
        type: 'cta',
        summary_title: '오늘의 요약',
        summary_items: ['등기부 확인', '특약 기재'],
        action_title: '저장해두세요',
        action_desc: '필요할 때 꺼내보세요.',
        icons: ['저장하기', '공유하기']
      }
    ]
  };
}

// 1. 정상 대본은 통과하고 번호가 재계산된다
check('정상 대본 통과 + 번호 재계산', () => {
  const input = validScript();
  input.slides[1].slide_number = 99;
  input.slides[1].total_slides = 99;
  const result = validateCardScript(input, { slideCount: 4, topic: '보증금' });
  assert.strictEqual(result.ok, true, result.errors.join(' / '));
  assert.strictEqual(result.slides.length, 4);
  assert.deepStrictEqual(result.slides.map(s => s.slide_number), [1, 2, 3, 4]);
  assert.strictEqual(result.slides[0].total_slides, 4);
  assert.strictEqual(result.errors.length, 0);
});

// 2. slides 배열 자체가 없으면 실패한다
check('slides 누락 실패', () => {
  const result = validateCardScript({ category: 'x' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors[0].includes('slides'));
});

// 3. 첫 장이 cover가 아니면 실패한다
check('cover 누락 실패', () => {
  const input = validScript();
  input.slides[0].type = 'body_list';
  const result = validateCardScript(input);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('cover')));
});

// 4. 본문 points가 비면 실패한다 (빈 카드 렌더 방지)
check('본문 points 누락 실패', () => {
  const input = validScript();
  input.slides[1].points = [];
  const result = validateCardScript(input);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('points')));
});

// 5. 알 수 없는 type은 거부한다
check('알 수 없는 type 거부', () => {
  const input = validScript();
  input.slides[2].type = 'body_video';
  const result = validateCardScript(input);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('body_video')));
});

// 6. 문자열 정규화: 공백 정리, 숫자→문자열, 비문자열 제거
check('문자열 정규화', () => {
  const input = validScript();
  input.slides[1].title = '  계약 전\n 확인할   3가지  ';
  input.slides[1].points[0].number = 1;
  input.slides[3].summary_items = ['  첫 항목  ', null, { a: 1 }, '둘째 항목'];
  const result = validateCardScript(input);
  assert.strictEqual(result.ok, true, result.errors.join(' / '));
  assert.strictEqual(result.slides[1].title, '계약 전 확인할 3가지');
  assert.strictEqual(result.slides[1].points[0].number, '1');
  assert.deepStrictEqual(result.slides[3].summary_items, ['첫 항목', '둘째 항목']);
});

// 7. 10장을 넘으면 잘라내고 경고한다
check('최대 10장 제한', () => {
  const input = validScript();
  const body = { type: 'body_list', title: '본문', points: [{ heading: 'h', desc: 'd' }] };
  input.slides = [input.slides[0], ...Array.from({ length: 12 }, () => ({ ...body })), input.slides[3]];
  const result = validateCardScript(input);
  assert.strictEqual(result.ok, false); // 마지막 cta가 잘려나가므로 실패 처리
  assert.ok(result.warnings.some(w => w.includes('10')));
});

// 8. 요청 장수와 다르면 경고만 하고 통과한다
check('장수 불일치 경고', () => {
  const input = validScript();
  const result = validateCardScript(input, { slideCount: 6 });
  assert.strictEqual(result.ok, true);
  assert.ok(result.warnings.some(w => w.includes('6')));
});

console.log(`\n${passed}개 검증 테스트 통과`);
