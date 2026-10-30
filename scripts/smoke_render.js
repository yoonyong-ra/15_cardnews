/**
 * 렌더 파이프라인 스모크 테스트 (API 키 · 외부 API 불필요)
 *
 * 고정 대본으로 1080x1350(deviceScaleFactor 2 → 2160x2700) PNG 4장을 실제 렌더링하고
 * 파일/해상도를 검증한 뒤 산출물을 정리한다. CI에서 렌더러 회귀를 잡는 용도.
 */

const fs = require('fs');
const path = require('path');
const { renderCardsToFolder, DEFAULT_OUTPUTS_DIR } = require('../engine/card_renderer');

const FOLDER = 'ci-smoke';
const EXPECTED_WIDTH = 2160;
const EXPECTED_HEIGHT = 2700;

const script = {
  category: 'CI · 렌더 스모크',
  date: '2026-01-01',
  author: { name: '@ci_check', avatar_letter: 'C' },
  slides: [
    {
      slide_number: 1,
      total_slides: 4,
      type: 'cover',
      tagline: '🚨 스모크 테스트',
      headline_prefix: '렌더 파이프라인',
      headline_highlight: '정상 동작',
      headline_suffix: '확인',
      image_caption: '표지 캡션',
      swipe_text: '밀어서 확인'
    },
    {
      slide_number: 2,
      total_slides: 4,
      type: 'body_list',
      step_badge: 'CHECK 01',
      title: '본문 리스트',
      points: [
        { number: '01', heading: '첫 번째', desc: '설명 1' },
        { number: '02', heading: '두 번째', desc: '설명 2' }
      ]
    },
    {
      slide_number: 3,
      total_slides: 4,
      type: 'body_visual',
      step_badge: 'ACTION 02',
      title: '본문 비주얼',
      points: [{ number: 'KEY', heading: '핵심', desc: '설명' }]
    },
    {
      slide_number: 4,
      total_slides: 4,
      type: 'cta',
      summary_title: '요약',
      summary_items: ['항목 1', '항목 2'],
      action_title: '저장하세요',
      action_desc: '테스트 산출물입니다.',
      icons: ['게시물 저장하기', '지인에게 공유하기']
    }
  ]
};

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24) throw new Error(`PNG가 너무 작습니다: ${filePath}`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

(async () => {
  const folderDir = path.join(DEFAULT_OUTPUTS_DIR, FOLDER);
  fs.rmSync(folderDir, { recursive: true, force: true });

  const result = await renderCardsToFolder({ script, folderName: FOLDER, folderDir });

  if (result.images.length !== script.slides.length) {
    throw new Error(`생성된 카드 수가 다릅니다: ${result.images.length} / ${script.slides.length}`);
  }

  const cardsDir = path.join(folderDir, 'cards');
  const files = fs.readdirSync(cardsDir).filter(name => name.endsWith('.png')).sort();
  if (files.length !== script.slides.length) {
    throw new Error(`cards 디렉터리 PNG 수가 다릅니다: ${files.length}`);
  }

  for (const file of files) {
    const { width, height } = readPngSize(path.join(cardsDir, file));
    if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
      throw new Error(`${file} 해상도가 다릅니다: ${width}x${height} (기대 ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT})`);
    }
  }

  if (!fs.existsSync(path.join(folderDir, 'script.json'))) {
    throw new Error('script.json이 생성되지 않았습니다.');
  }

  console.log(`✅ 렌더 스모크 테스트 통과: ${files.length}장 · ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}${result.warnings.length ? ` · ⚠️ 폰트 대체(${result.warnings.join(', ')})` : ''}`);

  fs.rmSync(folderDir, { recursive: true, force: true });
  process.exit(0);
})().catch(err => {
  console.error('❌ 렌더 스모크 테스트 실패:', err.message);
  process.exit(1);
});
