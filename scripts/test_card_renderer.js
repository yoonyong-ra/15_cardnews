const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildSlideHtml,
  formatCardDate,
  resolveSlideImage
} = require('../engine/card_renderer');

let passed = 0;

function check(name, fn) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

check('표지: 헤드라인/태그라인/스와이프 렌더', () => {
  const html = buildSlideHtml({
    type: 'cover',
    tagline: '🚨 긴급 점검',
    headline_prefix: '모르면',
    headline_highlight: '보증금',
    headline_suffix: '날립니다',
    image_caption: '확인 포인트',
    swipe_text: '밀어서 보기'
  });
  assert.ok(html.includes('content-cover'));
  assert.ok(html.includes('보증금'));
  assert.ok(html.includes('밀어서 보기'));
  assert.ok(html.includes('visual-placeholder'));
  assert.ok(!html.includes('cover-visual-overlay'));
});

check('표지: 이미지가 있을 때 overlay가 붙는다', () => {
  const html = buildSlideHtml({
    type: 'cover',
    headline_highlight: '보증금',
    image_caption: '표지 캡션',
    render_image: 'file:///C:/tmp/a.png'
  });
  assert.ok(html.includes('<img src="file:///C:/tmp/a.png"'));
  assert.ok(html.includes('cover-visual-overlay'));
  assert.ok(html.includes('표지 캡션'));
});

check('표지: 헤드라인이 길면 폰트가 줄어든다', () => {
  const long = buildSlideHtml({
    type: 'cover',
    headline_prefix: '아주 긴 문장이 들어가서 표지가 넘치지 않도록 해야 하는 경우',
    headline_highlight: '보증금 반환',
    headline_suffix: '꼭 확인하세요 정말로'
  });
  const short = buildSlideHtml({ type: 'cover', headline_highlight: '보증금' });
  assert.ok(long.includes('font-size: 46px'), 'long headline size');
  assert.ok(short.includes('font-size: 64px'), 'short headline size');
});

check('본문 리스트: 포인트 개수와 기본 배지', () => {
  const html = buildSlideHtml({
    type: 'body_list',
    title: '확인할 3가지',
    points: [
      { number: '01', heading: '등기부', desc: '근저당 확인' },
      { number: '02', heading: '특약', desc: '반환 특약' },
      { number: '03', heading: '보증보험', desc: '가입 여부' }
    ]
  });
  assert.ok(html.includes('content-body'));
  assert.strictEqual((html.match(/class="point-card"/g) || []).length, 3);
  assert.ok(html.includes('SUMMARY'));
  assert.ok(!html.includes('cover-visual-card'));
});

check('본문 비주얼: 이미지 슬롯과 배지 기본값', () => {
  const html = buildSlideHtml({
    type: 'body_visual',
    title: '실전 적용',
    points: [{ number: 'KEY', heading: '특약', desc: '문구 예시' }]
  });
  assert.ok(html.includes('cover-visual-card'));
  assert.ok(html.includes('ACTION'));
  assert.ok(html.includes('font-size: 26px'));
});

check('CTA: 요약 리스트와 아이콘 매핑', () => {
  const html = buildSlideHtml({
    type: 'cta',
    summary_title: '오늘의 요약',
    summary_items: ['항목 1', '항목 2'],
    action_title: '저장하세요',
    action_desc: '필요할 때 보세요',
    icons: ['게시물 저장하기', '지인에게 공유하기']
  });
  assert.ok(html.includes('<li>항목 1</li>'));
  assert.ok(html.includes('<li>항목 2</li>'));
  assert.ok(html.includes('💾 게시물 저장하기'));
  assert.ok(html.includes('📤 지인에게 공유하기'));
});

check('CTA: icons가 없으면 기본 아이콘 사용', () => {
  const html = buildSlideHtml({ type: 'cta', summary_title: '요약' });
  assert.ok(html.includes('게시물 저장하기'));
  assert.ok(html.includes('지인에게 공유하기'));
});

check('알 수 없는 type은 빈 문자열', () => {
  assert.strictEqual(buildSlideHtml({ type: 'body_video' }), '');
});

check('HTML 이스케이프', () => {
  const html = buildSlideHtml({
    type: 'body_list',
    title: '<script>alert(1)</script>',
    points: [{ number: '01', heading: 'A & B', desc: '"따옴표" 테스트' }]
  });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(html.includes('&quot;따옴표&quot;'));
});

check('formatCardDate 처리', () => {
  assert.strictEqual(formatCardDate('2026-10-30'), '2026.10.30');
  assert.strictEqual(formatCardDate('2026.1.5'), '2026.01.05');
  assert.strictEqual(formatCardDate('20261030'), '2026.10.30');
  assert.ok(/^\d{4}\.\d{2}\.\d{2}$/.test(formatCardDate('')));
});

check('resolveSlideImage: 허용 경로만 반환', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-render-'));
  const outputsDir = path.join(root, 'outputs');
  const assetsDir = path.join(root, 'assets');
  const folderDir = path.join(outputsDir, 'test-folder');
  fs.mkdirSync(path.join(folderDir, 'assets'), { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const inside = path.join(folderDir, 'assets', 'slide_01.png');
  fs.writeFileSync(inside, 'dummy');
  const outside = path.join(root, 'outside.png');
  fs.writeFileSync(outside, 'dummy');
  const projectAsset = path.join(assetsDir, 'cover_sample.jpg');
  fs.writeFileSync(projectAsset, 'dummy');

  const ok = resolveSlideImage({ slide_number: 1 }, folderDir, { outputsDir, assetsDir });
  assert.ok(ok.startsWith('file://'), ok);
  assert.ok(ok.includes('slide_01.png'));

  const blocked = resolveSlideImage({ slide_number: 2, image_path: outside }, folderDir, { outputsDir, assetsDir });
  assert.strictEqual(blocked, '');

  const assetsOk = resolveSlideImage({ slide_number: 1, image_path: projectAsset }, folderDir, { outputsDir, assetsDir });
  assert.ok(assetsOk.startsWith('file://'), assetsOk);
  assert.ok(assetsOk.includes('cover_sample.jpg'));

  fs.rmSync(root, { recursive: true, force: true });
});

console.log(`\n${passed}개 렌더러 테스트 통과`);
