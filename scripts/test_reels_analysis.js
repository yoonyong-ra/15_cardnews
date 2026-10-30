const assert = require('assert');
const { normalizeReelsAnalysis, REELS_ANGLE_IDS } = require('../engine/analyzer');

let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

check('정상 응답 정규화', () => {
  const result = normalizeReelsAnalysis({
    hookPattern: '의문형 + 손실회피',
    hookText: '아직도 그냥 통장에 두시나요?',
    pacing: '1) 손실 경고 → 2) 수치 제시 → 3) 체크리스트 → 4) 저장 유도',
    whyHot: '월급 손실 공포를 자극 (좋아요 1.8만)',
    tactics: ['첫 문장에 금액 명시', '저장 유도 CTA 고정'],
    recommendedFormula: 'angle_warning',
    advice: '계산 예시를 한 장 더 넣으면 저장률이 올라갑니다.'
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.hookPattern, '의문형 + 손실회피');
  assert.strictEqual(result.value.pacing.includes('→'), true);
  assert.deepStrictEqual(result.value.tactics, ['첫 문장에 금액 명시', '저장 유도 CTA 고정']);
  assert.strictEqual(result.value.recommendedFormula, 'angle_warning');
  assert.ok(result.value.extractedHook.includes('아직도'));
});

check('hookText만 있어도 통과', () => {
  const result = normalizeReelsAnalysis({
    hookText: '계약서 이 한 줄 없으면 보증금 못 받습니다',
    pacing: '1) 경고 → 2) 근거 → 3) 해결',
    advice: '표지에 특약 문구를 그대로 노출하세요.'
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.hookPattern, '');
  assert.ok(result.value.extractedHook.includes('계약서'));
});

check('전개 구조/가이드 누락은 실패', () => {
  const result = normalizeReelsAnalysis({ hookPattern: '숫자 리스트형' });
  assert.strictEqual(result.ok, false);
  assert.deepStrictEqual(result.errors, ['전개 구조', '재해석 가이드']);
});

check('알 수 없는 관점 id는 기본값으로 보정', () => {
  const result = normalizeReelsAnalysis({
    hookPattern: '질문형',
    pacing: '1) 질문 → 2) 답',
    advice: '짧게 유지',
    recommendedFormula: 'angle_unknown'
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.recommendedFormula, 'angle_warning');
  assert.ok(REELS_ANGLE_IDS.includes(result.value.recommendedFormula));
});

check('tactics 정리 (비문자열 제거·최대 4개·공백 정리)', () => {
  const result = normalizeReelsAnalysis({
    hookPattern: '손실 경고형',
    pacing: '1) 경고 → 2) 해결',
    advice: '수치를 넣으세요',
    tactics: ['  첫   전술 ', null, { a: 1 }, '둘째 전술', '셋째 전술', '넷째 전술', '다섯째 전술']
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.tactics.length, 4);
  assert.strictEqual(result.value.tactics[0], '첫 전술');
});

check('빈 객체는 실패', () => {
  const result = normalizeReelsAnalysis({});
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length >= 2);
});

console.log(`\n${passed}개 릴스 역분석 테스트 통과`);
