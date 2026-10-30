/**
 * outputs/<폴더>/script.json 을 1080x1350 PNG 카드 세트로 렌더링하는 CLI.
 * 서버(/api/render)와 동일한 engine/card_renderer.js 를 사용한다.
 *
 * 사용법:
 *   npm run render -- 261029_1325
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { renderCardsToFolder } = require('../engine/card_renderer');

const folder = (process.argv[2] || '').trim();

if (!folder) {
  console.error('사용법: npm run render -- <outputs 폴더명>  (예: npm run render -- 261029_1325)');
  process.exit(1);
}

if (!/^[0-9A-Za-z_-]{4,32}$/.test(folder)) {
  console.error('폴더명이 올바르지 않습니다. (영문·숫자·-·_ 4~32자)');
  process.exit(1);
}

const folderDir = path.join(__dirname, '..', 'outputs', folder);
const scriptPath = path.join(folderDir, 'script.json');

if (!fs.existsSync(scriptPath)) {
  console.error(`script.json을 찾을 수 없습니다: ${scriptPath}`);
  process.exit(1);
}

let script;
try {
  script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
} catch (err) {
  console.error(`script.json 파싱 실패: ${err.message}`);
  process.exit(1);
}

(async () => {
  const result = await renderCardsToFolder({ script, folderName: folder, folderDir });
  console.log(`🎉 ${result.images.length}장 렌더링 완료 → ${path.join(folderDir, 'cards')}`);
  if (result.warnings.length > 0) {
    console.warn(`⚠️ 웹폰트 로드 실패: ${result.warnings.join(', ')} (대체 폰트로 렌더링됨)`);
  }
  console.log(JSON.stringify({ success: true, folder: result.folder, images: result.images }, null, 2));
  process.exit(0);
})().catch(err => {
  console.error('렌더링 실패:', err.message);
  process.exit(1);
});
