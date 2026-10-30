/**
 * 카드뉴스 대본(AI JSON 응답) 검증 · 정규화 모듈
 *
 * LLM 응답은 형식이 보장되지 않으므로, 렌더 단계에 들어가기 전에
 * 슬라이드 타입별 필수 필드를 확인하고 문자열/배열을 안전한 형태로 정규화한다.
 * 검증 실패 시 analyzer가 1회 복구 요청을 보내고, 그래도 실패하면 기본 템플릿으로 대체한다.
 */

const SLIDE_TYPES = new Set(['cover', 'body_list', 'body_visual', 'cta']);
const MIN_SLIDES = 2;
const MAX_SLIDES = 10;

function cleanText(value, max = 200) {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanItems(value, max = 12, maxLength = 140) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, max);
}

function cleanPoints(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((point, index) => {
      if (!point || typeof point !== 'object') return null;
      const heading = cleanText(point.heading, 80);
      const desc = cleanText(point.desc, 240);
      if (!heading && !desc) return null;
      return {
        number: cleanText(point.number, 8) || String(index + 1).padStart(2, '0'),
        heading: heading || desc.slice(0, 24),
        desc: desc || heading
      };
    })
    .filter(Boolean);
}

function normalizeCover(slide, topic) {
  const cover = {
    type: 'cover',
    tagline: cleanText(slide.tagline, 60),
    headline_prefix: cleanText(slide.headline_prefix, 60),
    headline_highlight: cleanText(slide.headline_highlight, 60) || cleanText(topic, 60),
    headline_suffix: cleanText(slide.headline_suffix, 60),
    image_caption: cleanText(slide.image_caption, 120),
    swipe_text: cleanText(slide.swipe_text, 40)
  };
  if (slide.image_path) cover.image_path = cleanText(slide.image_path, 240);
  const hasHeadline = (cover.headline_prefix + cover.headline_highlight + cover.headline_suffix).trim().length > 0;
  const hasVisual = Boolean(cover.image_caption || cover.headline_highlight);
  return { cover, ok: hasHeadline && hasVisual };
}

function normalizeBody(slide) {
  const body = {
    type: slide.type,
    step_badge: cleanText(slide.step_badge, 24),
    title: cleanText(slide.title, 80),
    points: cleanPoints(slide.points)
  };
  if (slide.image_path) body.image_path = cleanText(slide.image_path, 240);
  if (!body.step_badge) body.step_badge = body.type === 'body_visual' ? 'ACTION' : 'POINT';
  return { body, ok: body.title.length > 0 && body.points.length > 0 };
}

function normalizeCta(slide) {
  const cta = {
    type: 'cta',
    summary_title: cleanText(slide.summary_title, 80),
    summary_items: cleanItems(slide.summary_items, 5, 100),
    action_title: cleanText(slide.action_title, 60),
    action_desc: cleanText(slide.action_desc, 140),
    icons: cleanItems(slide.icons, 4, 30)
  };
  return { cta, ok: cta.summary_title.length > 0 || cta.summary_items.length > 0 };
}

/**
 * @param {any} parsed LLM이 반환한 JSON 객체
 * @param {{ slideCount?: number, topic?: string }} options
 * @returns {{ ok: boolean, errors: string[], warnings: string[], slides: Array }}
 */
function validateCardScript(parsed, options = {}) {
  const errors = [];
  const warnings = [];
  const topic = cleanText(options.topic, 60);

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['응답이 JSON 객체가 아닙니다.'], warnings, slides: [] };
  }
  if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    return { ok: false, errors: ['slides 배열이 없습니다.'], warnings, slides: [] };
  }
  if (parsed.slides.length < MIN_SLIDES) {
    errors.push(`슬라이드가 ${parsed.slides.length}장뿐입니다. 최소 ${MIN_SLIDES}장이 필요합니다.`);
  }
  if (parsed.slides.length > MAX_SLIDES) {
    warnings.push(`슬라이드가 ${parsed.slides.length}장이라 ${MAX_SLIDES}장까지만 사용합니다.`);
  }

  const rawSlides = parsed.slides.slice(0, MAX_SLIDES);
  const slides = [];

  rawSlides.forEach((slide, index) => {
    if (!slide || typeof slide !== 'object') {
      errors.push(`slide ${index + 1}: 객체가 아닙니다.`);
      return;
    }
    if (!SLIDE_TYPES.has(slide.type)) {
      errors.push(`slide ${index + 1}: 알 수 없는 type '${String(slide.type).slice(0, 20)}'`);
      return;
    }

    const isFirst = index === 0;
    const isLast = index === rawSlides.length - 1;

    if (slide.type === 'cover') {
      const { cover, ok } = normalizeCover(slide, topic);
      if (!isFirst) warnings.push('cover 슬라이드가 첫 장이 아닙니다.');
      if (!ok) errors.push(`slide ${index + 1}: 표지 헤드라인이 비어 있습니다.`);
      slides.push(cover);
    } else if (slide.type === 'cta') {
      const { cta, ok } = normalizeCta(slide);
      if (!isLast) warnings.push('cta 슬라이드가 마지막 장이 아닙니다.');
      if (!ok) errors.push(`slide ${index + 1}: CTA 요약 내용이 비어 있습니다.`);
      slides.push(cta);
    } else {
      const { body, ok } = normalizeBody(slide);
      if (!isFirst && !isLast && !ok) {
        errors.push(`slide ${index + 1}: 본문 제목 또는 points가 비어 있습니다.`);
      } else if (!ok) {
        warnings.push(`slide ${index + 1}: 본문 내용이 비어 있어 기본 문구로 대체합니다.`);
      }
      slides.push(body);
    }
  });

  if (slides.length > 0 && slides[0].type !== 'cover') {
    errors.push('첫 슬라이드가 cover가 아닙니다.');
  }
  if (slides.length > 0 && slides[slides.length - 1].type !== 'cta') {
    errors.push('마지막 슬라이드가 cta가 아닙니다.');
  }
  if (options.slideCount && Number(options.slideCount) !== rawSlides.length) {
    warnings.push(`요청한 ${options.slideCount}장과 실제 ${rawSlides.length}장이 다릅니다.`);
  }

  // 번호/총 장수는 항상 실제 배열 기준으로 재계산한다.
  const normalized = slides.map((slide, index) => ({
    slide_number: index + 1,
    total_slides: slides.length,
    ...slide
  }));

  return { ok: errors.length === 0, errors, warnings, slides: normalized };
}

module.exports = { validateCardScript, SLIDE_TYPES };
