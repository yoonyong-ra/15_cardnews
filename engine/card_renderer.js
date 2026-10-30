/**
 * 카드뉴스 렌더러 (단일 구현)
 *
 * - 슬라이드 데이터 → HTML 변환(buildSlideHtml)과 1080x1350 PNG 렌더링(renderCardsToFolder)을 담당한다.
 * - 서버(/api/render)와 CLI(scripts/render_cards.js)가 같은 코드를 사용한다.
 * - Playwright 브라우저는 browser_pool의 싱글톤을 재사용한다.
 */

const fs = require('fs');
const path = require('path');
const { withPage } = require('./browser_pool');
const { buildCardThemeVars } = require('./card_theme');

const DEFAULT_OUTPUTS_DIR = path.join(__dirname, '..', 'outputs');
const DEFAULT_ASSETS_DIR = path.join(__dirname, '..', 'assets');
const DEFAULT_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'card_template.html');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatCardDate(value) {
  if (typeof value === 'string') {
    const match = value.match(/(20\d{2})\D{0,2}(\d{1,2})\D{0,2}(\d{1,2})/);
    if (match) {
      return `${match[1]}.${String(match[2]).padStart(2, '0')}.${String(match[3]).padStart(2, '0')}`;
    }
    const digits = value.replace(/\D/g, '');
    if (digits.length === 8) {
      return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
    }
  }
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')}`;
}

function isAllowedLocalImage(candidate, outputsDir, assetsDir) {
  const resolved = path.resolve(candidate);
  return resolved.startsWith(path.resolve(outputsDir) + path.sep)
    || resolved.startsWith(path.resolve(assetsDir) + path.sep);
}

/**
 * 슬라이드에 쓸 로컬 이미지 경로를 찾는다. outputs/·assets/ 밖 경로는 읽지 않는다.
 */
function resolveSlideImage(slide, outputDir, options = {}) {
  const outputsDir = options.outputsDir || DEFAULT_OUTPUTS_DIR;
  const assetsDir = options.assetsDir || DEFAULT_ASSETS_DIR;
  const slideAssetsDir = path.join(outputDir, 'assets');
  const candidates = [];

  if (slide.image_path) {
    if (/^https?:\/\//.test(slide.image_path)) {
      try {
        const remote = new URL(slide.image_path);
        if (remote.protocol === 'http:' || remote.protocol === 'https:') return slide.image_path;
      } catch (e) { /* 잘못된 URL은 무시하고 로컬 후보로 진행 */ }
    } else {
      const projectRoot = path.join(__dirname, '..');
      candidates.push(path.isAbsolute(slide.image_path) ? slide.image_path : path.join(projectRoot, slide.image_path));
    }
  }

  const n = slide.slide_number;
  const pad = String(n).padStart(2, '0');
  const names = n === 1
    ? ['cover.jpg', 'cover.png', 'slide1.jpg', 'slide1.png', `slide_${pad}.jpg`, `slide_${pad}.png`]
    : [`slide${n}.jpg`, `slide${n}.png`, `slide_${pad}.jpg`, `slide_${pad}.png`];

  for (const name of names) candidates.push(path.join(slideAssetsDir, name));

  for (const candidate of candidates) {
    if (!isAllowedLocalImage(candidate, outputsDir, assetsDir)) continue;
    if (fs.existsSync(candidate)) return `file://${candidate.replace(/\\/g, '/')}`;
  }
  return '';
}

function buildVisualInner(slide) {
  if (slide.render_image) {
    return `<img src="${escapeHtml(slide.render_image)}" alt="Visual">`;
  }
  const tag = escapeHtml(slide.step_badge || (slide.type === 'cover' ? 'KEY VISUAL' : 'DATA POINT'));
  const text = escapeHtml(slide.image_caption || slide.title || '');
  return `<div class="visual-placeholder">
               <div class="vp-tag">${tag}</div>
               <div class="vp-text">${text}</div>
             </div>`;
}

function pickIcon(label) {
  const text = String(label || '');
  if (/공유|태그|보내|전송|링크/.test(text)) return '📤';
  if (/저장|소장|북마크|보관/.test(text)) return '💾';
  if (/팔로우|구독/.test(text)) return '➕';
  if (/댓글|의견/.test(text)) return '💬';
  return '✅';
}

function buildPointsHtml(points, variant) {
  return (Array.isArray(points) ? points : []).map(point => {
    if (variant === 'visual') {
      return `
            <div class="point-card" style="padding: 22px 28px;">
              <div class="point-number" style="background: var(--accent-blue-soft); color: var(--accent-blue);">${escapeHtml(point.number)}</div>
              <div class="point-content">
                <div class="point-heading" style="font-size: 26px;">${escapeHtml(point.heading)}</div>
                <div class="point-desc" style="font-size: 22px;">${escapeHtml(point.desc)}</div>
              </div>
            </div>
          `;
    }
    return `
            <div class="point-card">
              <div class="point-number">${escapeHtml(point.number)}</div>
              <div class="point-content">
                <div class="point-heading">${escapeHtml(point.heading)}</div>
                <div class="point-desc">${escapeHtml(point.desc)}</div>
              </div>
            </div>
          `;
  }).join('');
}

/**
 * 슬라이드 1장의 본문 컨테이너 HTML을 만든다.
 * @param {object} slide script.json의 슬라이드
 * @param {{ pageNum?: string, totalPages?: string }} options
 */
function buildSlideHtml(slide, options = {}) {
  const pageNum = options.pageNum || String(slide.slide_number || 1).padStart(2, '0');
  const totalPages = options.totalPages || String(slide.total_slides || 1).padStart(2, '0');
  const visualInner = buildVisualInner(slide);

  if (slide.type === 'cover') {
    const coverLen = `${slide.headline_prefix || ''}${slide.headline_highlight || ''}${slide.headline_suffix || ''}`.length;
    const coverSize = coverLen > 44 ? 46 : coverLen > 32 ? 54 : 64;
    const overlay = slide.render_image
      ? `<div class="cover-visual-overlay">
                  <div class="cover-visual-caption">${escapeHtml(slide.image_caption || '')}</div>
                </div>`
      : '';

    return `
            <div class="content-cover">
              <div class="cover-tagline">${escapeHtml(slide.tagline || '')}</div>
              <h1 class="cover-headline" style="font-size: ${coverSize}px;">
                ${escapeHtml(slide.headline_prefix || '')} <br>
                <span class="highlight">${escapeHtml(slide.headline_highlight || '')}</span> ${escapeHtml(slide.headline_suffix || '')}
              </h1>
              <div class="cover-visual-card">
                ${visualInner}
                ${overlay}
              </div>
              <div class="swipe-hint">
                <span>${escapeHtml(slide.swipe_text || '밀어서 계속 보기')}</span>
                <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </div>
          `;
  }

  if (slide.type === 'body_list' || slide.type === 'body_visual') {
    const titleLen = String(slide.title || '').length;
    const bodyTitleSize = titleLen > 28 ? 38 : titleLen > 20 ? 43 : 48;
    const isVisual = slide.type === 'body_visual';
    const visualBlock = isVisual
      ? `<div class="cover-visual-card" style="height: 380px;">
                ${visualInner}
              </div>`
      : '';

    return `
            <div class="content-body">
              <div class="body-title-wrap">
                <div class="body-step-badge">${escapeHtml(slide.step_badge || (isVisual ? 'ACTION' : 'SUMMARY'))}</div>
                <h2 class="body-title" style="font-size: ${bodyTitleSize}px;">${escapeHtml(slide.title || '')}</h2>
              </div>
              ${visualBlock}
              <div class="point-cards-list">
                ${buildPointsHtml(slide.points, isVisual ? 'visual' : 'list')}
              </div>
            </div>
          `;
  }

  if (slide.type === 'cta') {
    const summaryItems = Array.isArray(slide.summary_items) ? slide.summary_items : [];
    const icons = Array.isArray(slide.icons) && slide.icons.length > 0
      ? slide.icons
      : ['게시물 저장하기', '지인에게 공유하기'];
    const listHtml = summaryItems.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    const iconsHtml = icons
      .map(icon => `<div class="cta-icon-item">${pickIcon(icon)} ${escapeHtml(icon)}</div>`)
      .join('');

    return `
            <div class="content-cta">
              <div class="cta-summary-box">
                <div class="cta-summary-title">📌 ${escapeHtml(slide.summary_title || '')}</div>
                <ul class="cta-summary-list">
                  ${listHtml}
                </ul>
              </div>
              <div class="cta-action-box">
                <div class="cta-action-title">${escapeHtml(slide.action_title || '')}</div>
                <div class="cta-action-desc">${escapeHtml(slide.action_desc || '')}</div>
                <div class="cta-icons-row">
                  ${iconsHtml}
                </div>
              </div>
            </div>
          `;
  }

  return '';
}

function buildHeaderFields(script, pageNum, totalPages) {
  return {
    category: script.category || '부동산 · 시사 · 재테크',
    date: formatCardDate(script.date),
    handle: script.author?.name || '@2839.studio',
    avatar: script.author?.avatar_letter || '2',
    page: `${pageNum} / ${totalPages}`
  };
}

/**
 * script를 PNG 카드 세트로 렌더링한다. (outputs/<folderName>/cards)
 * @returns {Promise<{ folder: string, images: string[], warnings: string[] }>}
 */
async function renderCardsToFolder({
  script,
  folderName,
  folderDir,
  theme,
  outputsDir = DEFAULT_OUTPUTS_DIR,
  assetsDir = DEFAULT_ASSETS_DIR,
  templatePath = DEFAULT_TEMPLATE_PATH
}) {
  if (!script || !Array.isArray(script.slides) || script.slides.length === 0) {
    throw new Error('올바른 대본 데이터가 필요합니다.');
  }

  const themeVars = buildCardThemeVars(theme);
  const targetOutputDir = folderDir || path.join(outputsDir, folderName);
  const cardsDir = path.join(targetOutputDir, 'cards');
  fs.mkdirSync(path.join(targetOutputDir, 'assets'), { recursive: true });
  fs.mkdirSync(cardsDir, { recursive: true });

  const generatedImages = [];
  const warnings = [];
  let fontWarningLogged = false;

  await withPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 }, async (page) => {
    for (const [idx, slide] of script.slides.entries()) {
      const slideNumber = slide.slide_number || idx + 1;
      const pageNum = String(slideNumber).padStart(2, '0');
      const totalPages = String(script.slides.length).padStart(2, '0');
      const slideForRender = {
        ...slide,
        slide_number: slideNumber,
        total_slides: script.slides.length,
        render_image: resolveSlideImage({ ...slide, slide_number: slideNumber }, targetOutputDir, { outputsDir, assetsDir })
      };

      await page.goto(`file://${templatePath}`);

      await page.evaluate(({ themeVars, header, slideHtml }) => {
        Object.entries(themeVars || {}).forEach(([key, value]) => {
          document.documentElement.style.setProperty(key, value);
        });

        document.getElementById('category-text').innerText = header.category;
        document.getElementById('date-text').innerText = header.date;
        document.getElementById('handle-text').innerText = header.handle;
        document.getElementById('avatar-text').innerText = header.avatar;
        document.getElementById('page-text').innerText = header.page;
        document.getElementById('slide-content-container').innerHTML = slideHtml;
      }, {
        themeVars,
        header: buildHeaderFields(script, pageNum, totalPages),
        slideHtml: buildSlideHtml(slideForRender, { pageNum, totalPages })
      });

      // 웹폰트/이미지가 실제로 준비될 때까지 기다린다. (고정 대기만으로는 대체 폰트로 굳는 경우가 있음)
      await page.evaluate(async () => {
        const tryLoad = font => document.fonts.load(font).catch(() => []);
        await Promise.race([
          Promise.all([
            document.fonts.ready,
            tryLoad('700 24px Pretendard'),
            tryLoad('700 24px "Space Grotesk"')
          ]),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        await Promise.all(Array.from(document.images).map(img => (
          img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = img.onerror = resolve; })
        )));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });

      const fontState = await page.evaluate(() => {
        // @import가 실패하면 document.fonts에 해당 family의 face가 아예 없다.
        // (check()는 face가 없을 때도 true를 반환할 수 있어 신뢰할 수 없다)
        const summarize = family => {
          const faces = Array.from(document.fonts).filter(face => face.family.replace(/["']/g, '') === family);
          return { faces: faces.length, loaded: faces.some(face => face.status === 'loaded') };
        };
        return { main: summarize('Pretendard'), accent: summarize('Space Grotesk') };
      });

      const missingFonts = [
        fontState.main.loaded ? null : 'Pretendard',
        fontState.accent.loaded ? null : 'Space Grotesk'
      ].filter(Boolean);
      missingFonts.forEach(name => {
        if (!warnings.includes(name)) warnings.push(name);
      });
      if (missingFonts.length > 0 && !fontWarningLogged) {
        console.warn(`[렌더] 웹폰트 로드 실패 → 대체 폰트로 렌더링됩니다: ${missingFonts.join(', ')} (CDN 접근 불가 또는 타임아웃)`);
        fontWarningLogged = true;
      }

      const filename = `slide_${pageNum}.png`;
      await page.screenshot({
        path: path.join(cardsDir, filename),
        clip: { x: 0, y: 0, width: 1080, height: 1350 }
      });
      generatedImages.push(`/outputs/${folderName || path.basename(targetOutputDir)}/cards/${filename}`);
    }
  });

  fs.writeFileSync(path.join(targetOutputDir, 'script.json'), JSON.stringify(script, null, 2));

  return {
    folder: folderName || path.basename(targetOutputDir),
    images: generatedImages,
    warnings
  };
}

module.exports = {
  renderCardsToFolder,
  buildSlideHtml,
  buildHeaderFields,
  formatCardDate,
  resolveSlideImage,
  escapeHtml,
  DEFAULT_OUTPUTS_DIR,
  DEFAULT_ASSETS_DIR,
  DEFAULT_TEMPLATE_PATH
};
