const assert = require('assert');
const { __test, fetchAutoRealEstateNews } = require('../collectors/estate_collector');

const { scoreNews, isDuplicate, suggestAngle, pickTag } = __test;

let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

// 1. 정책·세금 기사는 손실회피 적합도가 높고 '정책 체크' 이상으로 분류된다
check('정책/세금 기사 고득점', () => {
  const r = scoreNews(
    '퇴직급여 사외적립, 2030년까지 전 사업장 의무화 추진',
    '정부가 2030년까지 모든 사업장에 퇴직급여 사외적립을 의무화한다. 퇴직금 체불을 막겠다는 취지다.',
    'finance'
  );
  assert.ok(r.walletScore >= 45, `walletScore=${r.walletScore}`);
  assert.ok(['⚡ 정책 체크', '🚨 내 지갑 직결'].includes(r.relevance), r.relevance);
  assert.strictEqual(r.isPolicy, true);
  assert.ok(['angle_calc', 'angle_cheat', 'angle_warning'].includes(r.suggestedAngle));
});

// 2. 사건사고·추모 기사는 노이즈로 감점된다
check('사건사고/추모 기사 노이즈 처리', () => {
  const r = scoreNews(
    '이태원 참사 4주기 기억식 추모사하는 이재명 대통령',
    '유가족 인사말을 경청하는 이재명 대통령 부부',
    'politics'
  );
  assert.strictEqual(r.isNoise, true);
  assert.ok(r.walletScore < 30, `walletScore=${r.walletScore}`);
});

// 3. 정파 프레임 기사는 감점된다
check('정파 프레임 기사 감점', () => {
  const r = scoreNews(
    '이 대통령 "내국인 가정 역차별 돼선 안 돼"…공공조리원 다문화 우대 재차 언급',
    '대통령실 관계자 발언',
    'politics'
  );
  assert.ok(r.walletScore < 55, `walletScore=${r.walletScore}`);
});

// 4. 같은 사건을 다룬 중복 기사는 제거된다
check('중복 기사 감지', () => {
  assert.strictEqual(
    isDuplicate(
      '김포·구리·하남 등 경기권 신규 택지 6곳 지정…7만6천700가구 공급',
      ['수도권 신규택지 6곳 추가…김포·구리·하남 등 7만6700가구 공급']
    ),
    true
  );
  assert.strictEqual(
    isDuplicate(
      'ISA 계좌 비과세 한도 확대',
      ['이태원 참사 4주기 기억식 추모사하는 이재명 대통령']
    ),
    false
  );
});

// 5. 분야별 태그/관점 추천
check('태그·관점 추천', () => {
  const estateTag = pickTag('국토부, 수도권 신규 공공택지 계획 발표', 'estate');
  assert.ok(estateTag.tag.includes('부동산'), estateTag.tag);

  const policyTag = pickTag('세제 개정으로 종부세 과세 기준 변경', 'politics');
  assert.ok(policyTag.tag.includes('세제') || policyTag.tag.includes('법안'), policyTag.tag);

  assert.strictEqual(suggestAngle('대출 한도 5천만원 축소, 이자 부담 증가'), 'angle_calc');
});

// 6. 실시간 수집 스모크 테스트 (네트워크 필요: LIVE_TEST=1)
(async () => {
  if (process.env.LIVE_TEST === '1') {
    const bundle = await fetchAutoRealEstateNews('all');
    assert.ok(Array.isArray(bundle.items));
    assert.ok(Array.isArray(bundle.topPicks));
    assert.ok(bundle.items.length > 0, '수집 결과가 비어 있습니다');
    assert.ok(bundle.counts && 'estate' in bundle.counts && 'finance' in bundle.counts && 'politics' in bundle.counts);
    bundle.topPicks.forEach(p => assert.ok(p.walletScore >= 45));
    passed += 1;
    console.log(`✅ 실시간 수집 (${bundle.items.length}건, TOP ${bundle.topPicks.length})`);
  }

  console.log(`\n${passed}개 테스트 통과`);
})().catch(err => {
  console.error('❌ 테스트 실패:', err.message);
  process.exit(1);
});
