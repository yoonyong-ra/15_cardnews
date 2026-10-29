const axios = require('axios');
const cheerio = require('cheerio');

/**
 * 2839 CardNews Studio — 3대 분야(부동산 / 시사 / 재테크) 실시간 뉴스 수집기
 *
 * 설계 원칙
 * 1) 시사는 '정치 뉴스 전체'가 아니라 '내 지갑·내 권리에 닿는 정책/제도 변화'만 카드뉴스 소재로 승격한다.
 * 2) 사건사고·추모·정파 기사는 노이즈로 감점해 상단 노출을 막는다.
 * 3) 같은 사건을 다룬 포토/속보 중복 기사는 제목 유사도로 묶어 1건만 남긴다.
 * 4) 손실회피 적합도(walletScore)를 계산해 오늘 만들 카드뉴스 소재 TOP 5를 자동 선별한다.
 */

const FIELD_META = {
  estate: { label: '부동산', emoji: '🏠' },
  politics: { label: '시사', emoji: '🏛️' },
  finance: { label: '재테크', emoji: '💰' }
};

const SECTION_SOURCES = [
  { field: 'estate', section: 'estate', url: 'https://news.naver.com/breakingnews/section/101/260' },
  { field: 'finance', section: 'finance', url: 'https://news.naver.com/breakingnews/section/101/259' },
  { field: 'politics', section: 'politics', url: 'https://news.naver.com/breakingnews/section/100/264' },
  { field: 'politics', section: 'politics-general', url: 'https://news.naver.com/breakingnews/section/100/269' },
  { field: 'politics', section: 'society', url: 'https://news.naver.com/breakingnews/section/102/249' }
];

// 내 돈·내 집·내 권리에 직접 닿는 정책/제도 키워드
const POLICY_KEYWORDS = [
  '정책', '제도', '법안', '법률', '개정', '시행', '국회', '정부', '부처', '장관', '규제', '완화', '강화',
  '예산', '지원금', '보조금', '세제', '과세', '감세', '증세', '세금', '세율', '공제', '의무화', '폐지',
  '인상', '인하', '확대', '축소', '개편', '최저임금', '노동', '고용', '근로', '연금', '국민연금', '건강보험',
  '전기요금', '가스요금', '통신비', '물가', '육아', '보육', '출산', '교육', '입시', '의료', '주거',
  '대출', '금리', '한도', 'dsr', '주담대', '전세대출', '청약', '분양', '공급', '택지', '재건축', '재개발',
  '임대차', '보증금', '전세', '월세', '집값', '부동산', '취득세', '종부세', '양도세', '상속세', '증여세'
];

// 손실 회피 반응을 유발하는 표현
const LOSS_KEYWORDS = [
  '손실', '폭탄', '경고', '위험', '축소', '인상', '폐지', '중단', '연체', '체납', '사기', '피해',
  '과징금', '제재', '위법', '부담', '빚', '하락', '폭락', '미반환', '반환', '부적격', '탈락', '과태료',
  '벌금', '날린다', '토해', '사라진', '증발', '뺏', '빼앗', '못 받', '덜 받', '더 내', '부과'
];

// 카드뉴스로 만들면 안 되는 노이즈(사건사고·정파·포토뉴스)
const NOISE_KEYWORDS = [
  '참사', '추모', '기억식', '인사말', '포토', '부고', '사망', '숨져', '살인', '시신', '마약',
  '성범죄', '스토킹', '폭행', '감금', '구속', '신상공개', '검거', '화재', '실종', '음주운전',
  '투표지', '당대표', '계파', '친명', '친윤', '공천', '선거운동', '대선 후보', '축사', '내전', '탄핵',
  '개회사', '축하사', '기념사', '환영사', '세미나', '포럼', '간담회', '참석', '방문', '시찰', '정상회담', '촬영'
];

// 정파 프레임(정책이 아니라 진영 논쟁인 기사) 감점
const PARTISAN_KEYWORDS = [
  '역차별', '다문화', '여당', '야당', '국민의힘', '민주당', '대통령실', '지지율', '여론조사',
  '원내대표', '비대위', '장외투쟁', '특검', '측근', '사퇴', '출마'
];

const ESTATE_KEYWORDS = [
  '전세', '월세', '보증금', '매매', '집값', '아파트', '청약', '분양', '재건축', '재개발', '공급',
  '택지', '입주', '미분양', '주담대', 'dsr', '취득세', '종부세', '양도세', '임대차', '전세사기', '규제지역'
];

const FINANCE_KEYWORDS = [
  '주식', '코스피', '코스닥', '배당', '펀드', 'etf', '예금', '적금', 'isa', '연금', '퇴직', '절세',
  '연말정산', '환급', '보험', '카드', '수수료', '환율', '비트코인', '가상자산', '투자', '자산', '소득'
];

const TAG_RULES = [
  { tag: '🏠 부동산/공급', type: '부동산/공급', importance: '⭐ 공급·정책 발표', test: t => /공급|택지|분양|입주|미분양|재건축|재개발|신도시/.test(t) },
  { tag: '📋 청약/분양', type: '청약/분양', importance: '🔥 청약 기회', test: t => /청약|특공|줍줍|경쟁률|당첨/.test(t) },
  { tag: '💰 대출/금리', type: '금융/규제', importance: '🚨 한도·금리 변화', test: t => /대출|금리|dsr|한도|주담대|가계부채|연체/.test(t) },
  { tag: '📊 시세/전세', type: '시장/시세', importance: '📈 시장 변동', test: t => /집값|시세|전세|월세|보증금|매매가|하락|상승/.test(t) },
  { tag: '🧾 세제/법안', type: '세제/법안', importance: '🧾 세금 직결', test: t => /세금|세제|과세|감세|증세|공제|종부세|양도세|상속세|증여세|법안|개정/.test(t) },
  { tag: '💼 노동/고용', type: '노동/고용', importance: '💼 일자리 직결', test: t => /최저임금|노동|고용|근로|해고|실업|퇴직|연금/.test(t) },
  { tag: '🏥 복지/의료', type: '복지/의료', importance: '🏥 생활비 직결', test: t => /건강보험|의료|복지|연금|보육|육아|출산|지원금/.test(t) },
  { tag: '🎓 교육/육아', type: '교육/육아', importance: '🎓 가족 직결', test: t => /교육|입시|수능|학교|학원|육아|보육/.test(t) },
  { tag: '📈 재테크/투자', type: '재테크/투자', importance: '📈 자산 방어', test: t => /주식|코스피|코스닥|배당|펀드|etf|투자|환율|비트코인|가상자산/.test(t) },
  { tag: '💰 재테크/절세', type: '재테크/절세', importance: '💰 세금·수수료 방어', test: t => /절세|연말정산|환급|isa|연금저축|수수료|공제/.test(t) }
];

function countMatches(text, keywords) {
  const hits = [];
  for (const kw of keywords) {
    if (text.includes(kw)) hits.push(kw);
  }
  return hits;
}

function pickTag(text, field) {
  for (const rule of TAG_RULES) {
    if (rule.test(text)) {
      return { tag: rule.tag, importance: rule.importance, sourceType: rule.type };
    }
  }
  if (field === 'estate') return { tag: '🏠 부동산/정책', importance: '⭐ 정책 발표', sourceType: '부동산/정책' };
  if (field === 'finance') return { tag: '💰 재테크/자산', importance: '📈 자산 관리', sourceType: '재테크/자산' };
  return { tag: '🗞️ 시사/일반', importance: '📌 참고', sourceType: '시사/일반' };
}

function suggestAngle(text) {
  const hasNumber = /[0-9]/.test(text);
  const money = /(억|조|만원|원|%|퍼센트)/.test(text);
  if ((hasNumber || money) && /대출|세금|한도|이자|환급|보증금|월세|집값|연봉|소득/.test(text)) return 'angle_calc';
  if (/의무화|규제|개정|시행|신청|서류|체크|준비|조건|자격/.test(text)) return 'angle_cheat';
  if (/축소|인상|폐지|위험|손실|경고|부담|과태료|부적격/.test(text)) return 'angle_warning';
  return 'angle_easy';
}

/**
 * 손실회피 적합도(walletScore) 계산 — 0~98
 * 정책/제도 키워드, 손실 표현, 금액·수치, 분야 핵심어를 가점하고
 * 사건사고·정파·포토뉴스는 강하게 감점한다.
 */
function scoreNews(title, summary, field) {
  const text = `${title} ${summary || ''}`.toLowerCase();
  const policyHits = countMatches(text, POLICY_KEYWORDS);
  const lossHits = countMatches(text, LOSS_KEYWORDS);
  const noiseHits = countMatches(text, NOISE_KEYWORDS);
  const partisanHits = countMatches(text, PARTISAN_KEYWORDS);
  const fieldHits = countMatches(text, field === 'finance' ? FINANCE_KEYWORDS : ESTATE_KEYWORDS);

  let score = 10;
  score += Math.min(policyHits.length, 4) * 10;
  score += Math.min(lossHits.length, 3) * 8;
  if (/의무화|개정|시행|인상|인하|축소|확대|폐지|강화|완화|개편/.test(text)) score += 8;
  if (/[0-9]/.test(text)) score += 5;
  if (/(억|조|만원|%|퍼센트)/.test(text)) score += 7;
  if (field !== 'politics' && fieldHits.length > 0) score += 6;
  if (field === 'politics' && policyHits.length === 0) score -= 15;
  score -= Math.min(noiseHits.length, 3) * 22;
  score -= Math.min(partisanHits.length, 2) * 14;
  if (/^\[?(포토|영상|부고|인사|축사)/.test(title)) score -= 20;

  score = Math.max(0, Math.min(98, score));

  let relevance = '🗞️ 일반';
  if (score >= 70) relevance = '🚨 내 지갑 직결';
  else if (score >= 45) relevance = '⚡ 정책 체크';
  else if (score >= 25) relevance = '📌 참고';

  return {
    walletScore: score,
    relevance,
    isPolicy: policyHits.length > 0,
    suggestedAngle: suggestAngle(text),
    matchedKeywords: [...new Set([...policyHits, ...lossHits])].slice(0, 6),
    isNoise: noiseHits.length > 0
  };
}

function tokenize(title) {
  const cleaned = title
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^가-힣A-Za-z0-9 ]/g, ' ')
    .toLowerCase();
  return new Set(cleaned.split(/\s+/).filter(w => w.length >= 2));
}

function bigrams(title) {
  const cleaned = title
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^가-힣A-Za-z0-9]/g, '')
    .toLowerCase();
  const grams = new Set();
  for (let i = 0; i < cleaned.length - 1; i++) grams.add(cleaned.slice(i, i + 2));
  return grams;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function numbersOf(text) {
  // 금액·건수·가구수처럼 사건을 특정하는 수치만 사용 (연도/순번 제외)
  const found = text.match(/\d[\d,\.]*\s*(?:건|억|조|호|가구|세대|명|%|퍼센트|만원|원)/g) || [];
  return new Set(found.map(n => n.replace(/\s+/g, '')).filter(n => n.length >= 2));
}

function isDuplicate(title, keptTitles) {
  const aWords = tokenize(title);
  const aGrams = bigrams(title);
  const aNumbers = numbersOf(title);
  for (const other of keptTitles) {
    const wordSim = jaccard(aWords, tokenize(other));
    const similarity = Math.max(wordSim, jaccard(aGrams, bigrams(other)));
    if (similarity >= 0.36) return true;

    // 같은 고유 수치(예: '678건', '7만6700')를 공유하고 단어 겹침이 있으면 같은 사건으로 본다.
    const bNumbers = numbersOf(other);
    let sharedNumber = false;
    for (const n of aNumbers) if (bNumbers.has(n)) { sharedNumber = true; break; }
    if (sharedNumber && wordSim >= 0.05) return true;
  }
  return false;
}

/**
 * 네이버 뉴스 섹션 크롤러
 */
async function scrapeNaverSection(source, limit = 20) {
  const items = [];
  try {
    const res = await axios.get(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 8000
    });

    const $ = cheerio.load(res.data);
    $('.sa_item').each((i, el) => {
      if (items.length >= limit) return false;

      const titleEl = $(el).find('.sa_text_title');
      const title = titleEl.text().trim();
      const link = titleEl.attr('href');
      const press = $(el).find('.sa_text_press').text().trim() || '언론사';
      const summary = $(el).find('.sa_text_lede').text().trim();
      const timeStr = $(el).find('.sa_text_datetime').text().trim() || '방금 전';

      if (title && link) {
        items.push({
          field: source.field,
          section: source.section,
          title,
          press,
          url: link,
          timeStr,
          summary: summary || title
        });
      }
    });
  } catch (err) {
    console.warn(`[크롤러] ${source.section} 섹션 수집 경고:`, err.message);
  }
  return items;
}

/**
 * 3대 분야 실시간 뉴스 통합 수집
 * @param {'all'|'estate'|'finance'|'politics'} targetCategory
 * @returns {Promise<{items: Array, topPicks: Array, counts: Object, policyCount: number, collectedAt: string}>}
 */
async function fetchAutoRealEstateNews(targetCategory = 'all') {
  console.log(`[크롤러] 3대 분야(부동산·시사·재테크) 핫이슈 수집 가동 (${targetCategory})`);

  const cat = (targetCategory || 'all').toLowerCase();
  // 시사 탭은 부동산·재테크 섹션의 정책 소재까지 교차 확인해야 하므로 전체 섹션을 수집한다.
  const sources = cat === 'politics'
    ? SECTION_SOURCES
    : SECTION_SOURCES.filter(s => cat === 'all' || s.field === cat);
  const todayStr = new Date().toLocaleDateString('ko-KR');

  const results = await Promise.all(sources.map(s => scrapeNaverSection(s, cat === 'all' ? 12 : 18)));

  const seenUrls = new Set();
  const keptTitles = [];
  const collected = [];

  for (const group of results) {
    for (const item of group) {
      if (seenUrls.has(item.url)) continue;
      const dedupeText = `${item.title} ${item.summary || ''}`.slice(0, 220);
      if (isDuplicate(dedupeText, keptTitles)) continue;
      seenUrls.add(item.url);
      keptTitles.push(dedupeText);

      const scoring = scoreNews(item.title, item.summary, item.field);
      const tagInfo = pickTag(`${item.title} ${item.summary}`.toLowerCase(), item.field);

      collected.push({
        id: `hotissue_${item.field}_${collected.length + 1}`,
        field: item.field,
        fieldLabel: FIELD_META[item.field].label,
        category: item.field,
        source: `${item.press} (실시간 ${item.timeStr})`,
        sourceType: tagInfo.sourceType,
        title: item.title,
        press: item.press,
        url: item.url,
        date: `${todayStr} (${item.timeStr})`,
        tag: tagInfo.tag,
        importance: tagInfo.importance,
        summary: item.summary,
        ...scoring
      });
    }
  }

  // 분야별 점수 정렬 후 라운드로빈 믹스 (부동산 → 재테크 → 시사)
  const byField = {};
  for (const f of Object.keys(FIELD_META)) {
    byField[f] = collected.filter(i => i.field === f).sort((a, b) => b.walletScore - a.walletScore);
  }

  // 시사는 '내 지갑에 닿는 정책'만 노출한다. 해당 기사가 없으면 빈 상태를 그대로 보여준다.
  byField.politics = byField.politics
    .filter(i => i.isPolicy && !i.isNoise && i.walletScore >= 40)
    .map(i => ({ ...i, fieldLabel: '시사·정책', originField: '시사' }));

  // 시사 탭을 단독으로 열면, 부동산·재테크 섹션에서 발견된 고득점 정책 소재까지 '정책 렌즈'로 함께 보여준다.
  if (cat === 'politics') {
    const crossPolicy = collected
      .filter(i => i.field !== 'politics' && i.isPolicy && !i.isNoise && i.walletScore >= 45)
      .sort((a, b) => b.walletScore - a.walletScore)
      .slice(0, 6)
      .map(i => ({
        ...i,
        id: `${i.id}_policy`,
        field: 'politics',
        fieldLabel: '시사·정책',
        originField: i.fieldLabel,
        isCrossPolicy: true
      }));

    byField.politics = [...byField.politics, ...crossPolicy]
      .sort((a, b) => b.walletScore - a.walletScore)
      .slice(0, 10);
  }

  // 단일 카테고리 요청이면 해당 분야만 반환한다.
  if (cat !== 'all') {
    for (const f of Object.keys(byField)) {
      if (f !== cat) byField[f] = [];
    }
  }

  const items = [];
  const maxLen = Math.max(...Object.values(byField).map(arr => arr.length), 0);
  for (let step = 0; step < maxLen; step++) {
    for (const f of ['estate', 'finance', 'politics']) {
      if (byField[f][step]) items.push(byField[f][step]);
    }
  }

  const counts = { estate: 0, finance: 0, politics: 0 };
  items.forEach(i => { counts[i.field] = (counts[i.field] || 0) + 1; });

  const topPicks = items
    .filter(i => i.walletScore >= 45 && !i.isNoise)
    .sort((a, b) => b.walletScore - a.walletScore)
    .slice(0, 5)
    .map(i => ({
      id: i.id,
      field: i.field,
      fieldLabel: i.fieldLabel,
      title: i.title,
      url: i.url,
      press: i.press,
      tag: i.tag,
      relevance: i.relevance,
      walletScore: i.walletScore,
      suggestedAngle: i.suggestedAngle,
      summary: i.summary
    }));

  const policyCount = items.filter(i => i.isPolicy && !i.isNoise).length;

  console.log(`[크롤러] 수집 ${collected.length}건 | 부동산 ${counts.estate || 0} · 재테크 ${counts.finance || 0} · 시사 ${counts.politics || 0} | TOP ${topPicks.length}`);

  return {
    items,
    topPicks,
    counts,
    policyCount,
    collectedAt: new Date().toISOString()
  };
}

module.exports = {
  fetchAutoRealEstateNews,
  // 테스트용 내부 함수
  __test: { scoreNews, isDuplicate, suggestAngle, pickTag }
};
