/**
 * 5대 떡상 카드뉴스 공식 기반 자동 대본 생성기 & 릴스 URL 역분석 엔진
 */

const { validateCardScript } = require('./script_validator');
const { callChatCompletion } = require('./llm_client');

function formatKstDate() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 검증에 실패한 LLM 응답을 1회만 복구 요청한다. (추가 호출은 최대 1회)
 */
async function requestScriptRepair(openai, systemPrompt, userPrompt, brokenJson, errors) {
  try {
    console.warn(`[AI 대본 검증 실패 → 복구 요청] ${errors.join(' / ')}`);
    const completion = await callChatCompletion(openai, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        {
          role: 'user',
          content: `이전 응답이 아래 조건을 위반했습니다:\n- ${errors.join('\n- ')}\n\n` +
            `원본 내용과 관점은 유지하고, 조건을 모두 만족하는 JSON만 다시 출력하세요.\n` +
            `[이전 응답]\n${JSON.stringify(brokenJson).slice(0, 6000)}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0
    }, { timeout: 90000, retries: 1, label: 'AI 대본 복구' });
    return JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch (err) {
    console.error('[AI 대본 복구 요청 실패]', err.message);
    return null;
  }
}

/**
 * 7대 떡상 관점 + 사용자 인터랙티브 피드백 기반 고급 카드뉴스 대본 생성기
 */
async function generateAdvancedCardScript({
  topic,
  angleId = 'angle_warning',
  slideCount = 4,
  userFeedback = '',
  customHook = '',
  coreContext = {}
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  // 슬라이드 수는 기본 4장이되, 사용자가 지정하거나 원본 항목 수에 따라 최대 10장까지 가변 지원
  const count = Math.min(10, Math.max(4, parseInt(slideCount) || 4));

  const ANGLE_META = {
    angle_warning: { name: "반전/폭로/경고형 (손실 회피)", tag: "🚨 긴급 점검 · 손실 방지" },
    angle_cheat: { name: "치트키/체크리스트형 (소장 가치)", tag: "📋 핵심 치트키 · 소장 가치" },
    angle_easy: { name: "초등학생 눈높이 3분 쉬운 요약형 (대중성)", tag: "💡 3분 컷 · 쉬운 해설" },
    angle_vs: { name: "극단적 VS 비교형 (댓글 토론)", tag: "⚖️ 데이터 검증 · 극단 비교" },
    angle_story: { name: "성공/실패 실화 스토리텔링형 (공감/몰입)", tag: "📈 실화 로드맵 · 실전 사례" },
    angle_target: { name: "초개인화 타겟팅형 (클릭률 극대화)", tag: "🎯 타겟 맞춤 · 필수 혜택" },
    angle_calc: { name: "1분 계산기/수치 공식형 (스크랩 유도)", tag: "🔢 1분 계산기 · 수치 공식" }
  };

  const selectedMeta = ANGLE_META[angleId] || ANGLE_META.angle_warning;

  if (apiKey && apiKey.trim() && !apiKey.includes('your_openai_api_key')) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: apiKey.trim() });

      console.log(`[AI 대본 생성] 주제: '${topic}' | 관점: '${selectedMeta.name}' | 슬라이드 수: ${count}장`);

      const systemPrompt = `
당신은 인스타그램에서 2839 세대(28~39세 수도권 월급쟁이·가구주)의 자산(부동산/재테크)과 권리(시사/정책) 생존 솔루션을 기획하는 수석 에디터입니다.
주어진 주제, 원본 맥락(캡션, 음성 STT, 이미지 OCR 텍스트), 선택된 떡상 관점을 기반으로 총 ${count}장의 핀터레스트풍(1080x1350) 카드뉴스 대본을 JSON으로 작성해주세요.

[🎯 2839 손실 회피(Loss Aversion) 원칙]
- 독자가 겪을 수 있는 **'실질적 손실(자산 증발, 세금 폭탄, 보증금 미반환, 정책 변화로 인한 부담)'**을 직관적인 팩트와 수치로 경고하십시오.
- **부동산:** 보증금 미반환, DSR 한도 축소, 청약 부적격 등 내 돈을 잃지 않는 명확한 방어 체크리스트 제시.
- **재테크:** 숨은 세금·수수료, 연말정산 환급 누락, 연금 공백 등 '모르면 새는 돈'을 수치로 보여주고 절세 액션 제시.
- **시사/정책:** 정파 논쟁이 아니라 **'내 지갑에 +인지 −인지'**로 번역. 시행일·대상·금액·신청 조건을 빠짐없이 정리하고, 모르면 손해인 조건을 경고.

[🚨 정보 누락 제로 & 전수 수록 절대 원칙]
- 원본 맥락에 구체적인 리스트 항목(예: '24가지 필수 확장팩', '10대 체크리스트', '8개 플러그인/8개 스킬/8개 MCP' 등)이 있는 경우:
  1. 절대로 '대표 3개'만 뽑고 나머지를 생략하지 마십시오.
  2. 원본에 명시된 모든 고유 명칭과 역할을 본문 슬라이드(Slide 2 ~ ${count - 1})들에 분류별로 나누어 100% 온전히 전수 수록하십시오.
  3. 한 슬라이드당 3~4개씩 상세히 배치하거나, 슬라이드 내 리스트(points)에 빠짐없이 나열하여 원본의 가치를 100% 보존하십시오.

[슬라이드 구조 규칙]
- 슬라이드 1 (type: "cover"): 스크롤을 멈추게 하는 강력한 후킹 표지. tagline, headline_prefix, headline_highlight, headline_suffix, image_caption, swipe_text 작성.
- **표지 글자 수 제한 (디자인 깨짐 방지):** headline_prefix 14자 이내, headline_highlight 16자 이내, headline_suffix 14자 이내. 주제 문장을 통째로 넣지 말고 핵심 손실만 압축하십시오.
- **본문 제목은 22자 이내**, point heading은 16자 이내로 작성하십시오.
- 슬라이드 2 ~ ${count - 1} (type: "body_list" 또는 "body_visual"): 각 장마다 명확한 step_badge(예: "PART 01", "CHECK 02", "SOLUTION 03"), 제목(title), 그리고 핵심 포인트 목록(points: [{ number, heading, desc }]). 문장은 모바일에서 읽기 편하게 가독성 높게 작성.
- 마지막 슬라이드 ${count} (type: "cta"): summary_title, summary_items (핵심 요약 3줄), action_title, action_desc, icons (예: ["게시물 저장하고 두고두고 보기", "필요한 지인에게 공유하기"]).

다음 JSON 형식으로만 엄격하게 응답해주세요:
{
  "category": "트렌드 · 심층 분석",
  "tagline": "${selectedMeta.tag}",
  "slides": [
    {
      "slide_number": 1,
      "total_slides": ${count},
      "type": "cover",
      "tagline": "${selectedMeta.tag}",
      "headline_prefix": "앞부분 문구",
      "headline_highlight": "${topic}",
      "headline_suffix": "뒷부분 문구",
      "image_caption": "표지 보조 설명 1줄",
      "swipe_text": "밀어서 전체 리스트 확인"
    },
    ... (중간 본문 슬라이드들: body_list 또는 body_visual) ...
    {
      "slide_number": ${count},
      "total_slides": ${count},
      "type": "cta",
      "summary_title": "오늘의 핵심 포인트 3줄 요약",
      "summary_items": ["요약 1", "요약 2", "요약 3"],
      "action_title": "더 많은 꿀팁이 궁금하다면?",
      "action_desc": "저장하고 매일 새로운 인사이트를 받아보세요!",
      "icons": ["저장하기", "공유하기"]
    }
  ]
}
`;

      const userPrompt = `
[주제]: ${topic}
[선택된 떡상 관점]: ${selectedMeta.name}
[추천/지정 후킹 문구]: ${customHook || '(AI가 최적화)'}
[사용자 피드백 / 추가 지시사항]: ${userFeedback || '(기본 최고 퀄리티로 작성)'}
[참고 원본 텍스트 및 STT 음성]:
- 캡션: ${coreContext.caption || ''}
- 음성/STT: ${coreContext.audioText || ''}
- 이미지분석: ${coreContext.imageText || ''}
`.trim();

      const completion = await callChatCompletion(openai, {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }, { timeout: 120000, retries: 1, label: 'AI 대본' });

      let parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      let validation = validateCardScript(parsed, { slideCount: count, topic });
      let repairedUsed = false;

      // 형식이 깨진 응답은 1회만 복구 요청하고 다시 검증한다.
      if (!validation.ok) {
        const repaired = await requestScriptRepair(openai, systemPrompt, userPrompt, parsed, validation.errors);
        if (repaired) {
          parsed = repaired;
          validation = validateCardScript(repaired, { slideCount: count, topic });
          repairedUsed = true;
        }
      }

      if (validation.ok) {
        if (validation.warnings.length > 0) {
          console.warn(`[AI 대본 검증 경고] ${validation.warnings.join(' / ')}`);
        }
        return {
          project_title: `${topic} 카드뉴스`,
          category: typeof parsed.category === 'string' && parsed.category.trim() ? parsed.category.trim() : "부동산 핫이슈 · 분석",
          date: formatKstDate(),
          author: {
            name: "@realestate_insights",
            avatar_letter: "R"
          },
          tagline: selectedMeta.tag,
          validation: { ok: true, repaired: repairedUsed, warnings: validation.warnings },
          slides: validation.slides
        };
      }

      console.error(`[AI 대본 검증 실패, Fallback 전환] ${validation.errors.join(' / ')}`);
    } catch (err) {
      console.error(`[AI 대본 생성 실패, Fallback 전환]`, err.message);
    }
  }

  // Fallback 템플릿 생성기
  const slides = [];
  slides.push({
    slide_number: 1,
    total_slides: count,
    type: "cover",
    tagline: selectedMeta.tag,
    headline_prefix: "모르면 손해보는",
    headline_highlight: `${topic}`,
    headline_suffix: "핵심 팩트 체크",
    image_path: "../assets/cover_sample.jpg",
    image_caption: customHook || "지금 당장 확인해야 할 필수 체크포인트",
    swipe_text: "밀어서 3분 확인"
  });

  for (let i = 2; i < count; i++) {
    const isVisual = i % 2 === 1;
    if (isVisual) {
      slides.push({
        slide_number: i,
        total_slides: count,
        type: "body_visual",
        step_badge: `CHECK 0${i - 1}`,
        title: `${topic} 핵심 체크포인트 0${i - 1}`,
        image_path: "../assets/doc_sample.jpg",
        points: [
          {
            number: `0${i - 1}`,
            heading: `${topic} 실전 적용 가이드`,
            desc: userFeedback ? `사용자 요청 반영: ${userFeedback}` : "최신 정책 및 시장 데이터에 맞추어 사전에 철저한 준비가 필요합니다."
          }
        ]
      });
    } else {
      slides.push({
        slide_number: i,
        total_slides: count,
        type: "body_list",
        step_badge: `POINT 0${i - 1}`,
        title: `${topic} 주요 변동 사항 및 주의점`,
        points: [
          {
            number: "A",
            heading: "반드시 확인해야 할 필수 요건",
            desc: "새롭게 개편된 기준과 일정을 체크하지 않으면 기회를 놓칠 수 있습니다."
          },
          {
            number: "B",
            heading: "실전 대처 및 리스크 방지책",
            desc: "자금 계획을 보수적으로 수립하고 사전에 모의 계산을 완료하세요."
          }
        ]
      });
    }
  }

  slides.push({
    slide_number: count,
    total_slides: count,
    type: "cta",
    summary_title: "오늘의 핵심 포인트 3줄 요약",
    summary_items: [
      `${topic} 관련 최신 변동 사항 확인`,
      "본인 조건에 맞는 자격 및 혜택 사전 점검",
      "안전한 자금 조달 계획 및 특약 기재 필수"
    ],
    action_title: "놓치면 아쉬운 실전 부동산 정보",
    action_desc: "유익하셨다면 게시물을 저장하고 지인에게 공유해보세요!",
    icons: ["나중에 보려고 저장", "친구 태그하기"]
  });

  return {
    project_title: `${topic} 카드뉴스`,
    category: "부동산 핫이슈 · 분석",
    date: formatKstDate(),
    author: {
      name: "@realestate_insights",
      avatar_letter: "R"
    },
    formula: angleId,
    tagline: selectedMeta.tag,
    slides
  };
}

/**
 * 릴스/게시물 URL 역분석 — 실제 캡션·성과 지표를 근거로 구조를 분석한다.
 * 수집에 실패했거나 캡션이 없으면 추측 결과를 만들지 않고 실패를 돌려준다.
 */
const REELS_ANGLE_IDS = [
  'angle_warning', 'angle_cheat', 'angle_easy', 'angle_vs',
  'angle_story', 'angle_target', 'angle_calc'
];

function cleanReelsText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeReelsAnalysis(parsed = {}) {
  const hookPattern = cleanReelsText(parsed.hookPattern, 100);
  const hookText = cleanReelsText(parsed.hookText, 160);
  const pacing = cleanReelsText(parsed.pacing, 300);
  const whyHot = cleanReelsText(parsed.whyHot, 300);
  const advice = cleanReelsText(parsed.advice, 300);
  const tactics = Array.isArray(parsed.tactics)
    ? parsed.tactics.map(t => cleanReelsText(t, 140)).filter(Boolean).slice(0, 4)
    : [];
  const recommendedFormula = REELS_ANGLE_IDS.includes(parsed.recommendedFormula)
    ? parsed.recommendedFormula
    : 'angle_warning';

  const missing = [];
  if (!hookPattern && !hookText) missing.push('후킹 패턴/문장');
  if (!pacing) missing.push('전개 구조');
  if (!advice) missing.push('재해석 가이드');
  if (missing.length > 0) {
    return { ok: false, errors: missing };
  }

  return {
    ok: true,
    value: {
      hookPattern,
      hookText,
      extractedHook: hookPattern ? (hookText ? `${hookPattern} · "${hookText}"` : hookPattern) : `"${hookText}"`,
      pacing,
      whyHot,
      advice,
      tactics,
      recommendedFormula,
      basis: 'caption'
    }
  };
}

async function analyzeReelsReference({ url, caption, author, likesCount, viewsCount, hasVideo }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim() || apiKey.includes('your_openai_api_key')) {
    return { success: false, error: 'OPENAI_API_KEY가 설정되지 않아 릴스 역분석을 실행할 수 없습니다.' };
  }
  if (!caption || caption.trim().length < 10) {
    return {
      success: false,
      error: '게시물 캡션이 없거나 너무 짧아 분석할 텍스트가 없습니다. (비공개·삭제된 게시물이거나 캡션이 없는 릴스일 수 있습니다)'
    };
  }

  const systemPrompt = `
당신은 인스타그램 릴스·카드뉴스의 '떡상 구조'를 해부하는 콘텐츠 분석가입니다.
제공된 캡션과 성과 지표만으로 이 게시물의 구성 전략을 추론해 JSON으로만 응답하세요.

[규칙]
- 캡션에 없는 사실·수치·사건을 지어내지 마세요. 추론한 내용은 추정임이 드러나게 쓰세요.
- hookText는 캡션에 실제로 존재하는 문장을 그대로 인용하고, 없으면 빈 문자열로 두세요.
- pacing은 이 캡션이 정보를 전개하는 순서를 3~5단계로 요약하세요. (예: "1) 손실 경고 → 2) 수치 제시 → 3) 체크리스트 → 4) 저장 유도")
- recommendedFormula는 다음 7개 id 중 하나만 고르세요: ${REELS_ANGLE_IDS.join(', ')}
- 모든 값은 한국어로 작성하세요.

[응답 JSON]
{
  "hookPattern": "후킹 문법 요약 (예: 의문형 + 손실회피, 숫자 리스트 + 시간 약속)",
  "hookText": "캡션에서 후킹 역할을 하는 실제 문장",
  "pacing": "1) ... → 2) ... → 3) ...",
  "whyHot": "반응을 얻었을 심리적 요인 (지표가 있으면 근거로 언급)",
  "tactics": ["재현 가능한 구체적 전술 1", "전술 2"],
  "recommendedFormula": "angle_warning",
  "advice": "우리 카드뉴스로 재해석할 때의 방향 1~2문장"
}
`.trim();

  const userPrompt = `
[게시물 URL]: ${url}
[작성자]: ${author || '(미상)'}
[성과 지표]: ${Number.isFinite(likesCount) || Number.isFinite(viewsCount)
    ? `좋아요 ${likesCount || 0}개 / 조회수 ${viewsCount || 0}회`
    : '제공되지 않음'}
[미디어 형태]: ${hasVideo ? '릴스 영상' : '이미지·카드뉴스'}
[캡션]:
${caption.slice(0, 4000)}
`.trim();

  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: apiKey.trim() });

    const completion = await callChatCompletion(openai, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    }, { timeout: 60000, retries: 1, label: '릴스 역분석' });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    const normalized = normalizeReelsAnalysis(parsed);

    if (!normalized.ok) {
      console.warn(`[릴스 역분석] 응답 형식 부족: ${normalized.errors.join(' / ')}`);
      return {
        success: false,
        error: `분석 결과 형식이 올바르지 않습니다 (누락: ${normalized.errors.join(', ')}). 다시 시도해주세요.`
      };
    }

    return { success: true, analysis: normalized.value };
  } catch (err) {
    console.error('[릴스 역분석 오류]', err.message);
    return { success: false, error: `릴스 역분석에 실패했습니다: ${err.message}` };
  }
}

module.exports = {
  generateAdvancedCardScript,
  analyzeReelsReference,
  normalizeReelsAnalysis,
  REELS_ANGLE_IDS
};

