require('dotenv').config();
const { ApifyClient } = require('apify-client');

/**
 * 전날 00:00:00(KST) Date 객체 및 YYYY-MM-DD 문자열 계산
 */
function getYesterdayKSTInfo() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kstNow = new Date(utc + (9 * 3600000));
  
  const yesterday = new Date(kstNow);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  return {
    dateObj: yesterday,
    timestampMs: yesterday.getTime(),
    timestampSec: Math.floor(yesterday.getTime() / 1000),
    dateStr: dateStr
  };
}

/**
 * 1. Apify - 주제별 실시간 릴스 20개 수집 (어제 0시 이후) ➔ 반응도 순 '베스트 TOP 5' 선별
 */
async function fetchInstagramTopicTrends(topic = '청약') {
  const token = process.env.APIFY_TOKEN;
  const { timestampSec, dateStr } = getYesterdayKSTInfo();
  
  // 키워드 앞의 '#' 기호 자동 제거 및 정제
  const cleanTopic = (topic || '청약').trim().replace(/^#/, '');
  
  console.log(`[Apify 핫트렌드 수집기] 검색 주제: '#${cleanTopic}' | 릴스(reels) 20개 수집 | 기준: ${dateStr} (KST 00:00) 이후`);

  let rawPosts = [];

  if (token && token.trim()) {
    try {
      const client = new ApifyClient({ token: token.trim() });
      const tagUrl = `https://www.instagram.com/explore/tags/${encodeURIComponent(cleanTopic)}/`;
      console.log(`[Apify] tagUrl 호출 시작: ${tagUrl} (resultsType: 'posts', resultsLimit: 20, onlyPostsNewerThan: ${dateStr})`);

      const run = await client.actor('apify/instagram-scraper').call({
        directUrls: [tagUrl],
        resultsType: 'posts',
        resultsLimit: 20,
        onlyPostsNewerThan: dateStr
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      console.log(`[Apify] 인스타그램 피드 수집 성공! 원시 아이템 개수: ${items.length}개`);

      // 어제 0시 이후 게시물 필터링 및 데이터 정제
      rawPosts = items
        .filter(item => {
          if (!item.timestamp) return true; // 타임스탬프 없으면 포함
          const itemTimeSec = Math.floor(new Date(item.timestamp).getTime() / 1000);
          return itemTimeSec >= timestampSec;
        })
        .map((item, idx) => {
          const cleanCaption = (item.caption || '').trim();
          const likes = item.likesCount || 0;
          const views = item.videoViewCount || item.videoPlayCount || 0;
          
          let whyHotText = '';
          if (views > 0 && likes > 0) {
            whyHotText = `조회수 ${(views >= 10000 ? (views/10000).toFixed(1) + '만' : views.toLocaleString())}회 · 좋아요 ${likes.toLocaleString()}개`;
          } else if (likes > 0) {
            whyHotText = `실시간 좋아요 ${likes.toLocaleString()}개 돌파`;
          } else if (views > 0) {
            whyHotText = `실시간 조회수 ${views.toLocaleString()}회 기록`;
          } else {
            whyHotText = `최신 해시태그 #${cleanTopic} 릴스`;
          }

          const isVid = item.isVideo || !!item.videoUrl || item.type === 'Video';
          const vidUrl = item.videoUrl || item.video_url || null;
          const imgList = (item.images && item.images.length > 0) 
            ? item.images 
            : (item.childPosts ? item.childPosts.map(c => c.displayUrl).filter(Boolean) : [item.displayUrl].filter(Boolean));

          return {
            id: `apify_${item.id || idx}`,
            topic: cleanTopic,
            author: item.ownerUsername ? `@${item.ownerUsername}` : `@creator_${idx + 1}`,
            url: item.url || (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}` : `https://www.instagram.com`),
            caption: cleanCaption || `[#${cleanTopic}] 실시간 인기 릴스 (#${idx + 1})`,
            likesCount: likes,
            viewsCount: views,
            isVideo: isVid,
            videoUrl: vidUrl,
            imageUrls: imgList,
            commentsCount: item.commentsCount || (item.latestComments ? item.latestComments.length : 0),
            postedAt: item.timestamp || new Date().toISOString(),
            thumbnail: item.displayUrl || (item.images && item.images[0]) || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&auto=format&fit=crop&q=80",
            isSample: false,
            whyHot: whyHotText
          };
        });

    } catch (err) {
      console.error(`[Apify API 호출 오류]`, err.message);
    }
  }

  // Fallback: Apify 결과가 없거나 토큰 미등록 시 3대 분야(부동산, 시사, 재테크) 손실회피 샘플 제공
  if (rawPosts.length === 0) {
    console.log(`[Apify Fallback] 실시간 릴스 샘플 데이터를 생성합니다. (검색어: #${cleanTopic})`);
    
    // 카테고리 판별
    const isPolicy = ['정책', '법안', '세제', '국회', '정부', '예산', '연금', '규제', '개정', '시행', '지원금', '건강보험'].some(k => cleanTopic.includes(k));
    const isFinance = cleanTopic.includes('재테크') || cleanTopic.includes('절세') || cleanTopic.includes('연말정산') || cleanTopic.includes('세금') || cleanTopic.includes('주식') || cleanTopic.includes('환급');

    const samplePool = isPolicy ? [
      {
        caption: `[#${cleanTopic}] 이 제도 시행일 모르면 지원금 못 받습니다. 신청 조건·서류·마감일 3분 정리`,
        likes: 11800,
        views: 290000,
        thumb: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=600&auto=format&fit=crop&q=80",
        why: "조회수 29.0만회 · 신청 기한 놓쳐 손해 본 사례 급증"
      },
      {
        caption: `[#${cleanTopic}] 세제 개정으로 내 세금만 오릅니다. 바뀌는 공제·과세 기준 한눈에 비교`,
        likes: 9700,
        views: 235000,
        thumb: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80",
        why: "조회수 23.5만회 · 절세 시점 놓치면 수백만원 차이"
      },
      {
        caption: `[#${cleanTopic}] 연금·퇴직 제도 변화, 방치하면 노후 수령액이 줄어듭니다. 지금 확인할 3가지`,
        likes: 8300,
        views: 190000,
        thumb: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=600&auto=format&fit=crop&q=80",
        why: "조회수 19.0만회 · 연금 공백 경고 저장 급증"
      },
      {
        caption: `[#${cleanTopic}] 건강보험료·공과금 조정, 고지서 보고 놀라기 전에 미리 계산하는 법`,
        likes: 7100,
        views: 160000,
        thumb: "https://images.unsplash.com/photo-1554224154-26032ffc0d07?w=600&auto=format&fit=crop&q=80",
        why: "조회수 16.0만회 · 생활비 직결 계산기"
      },
      {
        caption: `[#${cleanTopic}] 청약·대출 제도 개편, 조건 하나 달라져도 탈락합니다. 시행 전 체크리스트`,
        likes: 6400,
        views: 140000,
        thumb: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80",
        why: "조회수 14.0만회 · 자격 박탈 방지"
      }
    ] : isFinance ? [
      {
        caption: `[#${cleanTopic}] 연말정산 때 13월의 월급? 아니면 세금 폭탄? 지금 안 챙기면 내년 2월에 120만원 토해냅니다. ISA·연금저축 필수 세팅법`,
        likes: 18500,
        views: 450000,
        thumb: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80",
        why: "실시간 조회수 45.0만회 · 세금 손실 방지 1위"
      },
      {
        caption: `[#${cleanTopic}] 월급 300만원 통장에 그냥 두면 1년에 180만원 증발합니다. 2026 파킹통장·CMA 금리 비교 총정리`,
        likes: 14200,
        views: 320000,
        thumb: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=600&auto=format&fit=crop&q=80",
        why: "조회수 32.0만회 · 숨은 이자 찾기"
      },
      {
        caption: `[#${cleanTopic}] 모르고 지나치면 평생 못 찾는 '내 숨은 금융 자산' 3분 만에 계좌로 환급받는 사이트 4곳`,
        likes: 11900,
        views: 280000,
        thumb: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&auto=format&fit=crop&q=80",
        why: "조회수 28.0만회 · 즉시 환급 저장 폭주"
      },
      {
        caption: `[#${cleanTopic}] 미국 배당주 투자할 때 양도소득세 22% 안 내는 법. 비과세 계좌 활용 치트키`,
        likes: 9300,
        views: 210000,
        thumb: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&auto=format&fit=crop&q=80",
        why: "조회수 21.0만회 · 절세 치트키"
      },
      {
        caption: `[#${cleanTopic}] 신용점수 800점대 이하 직장인, 대출 이자 1% 낮춰서 연 240만원 아끼는 금리인하요구권 사용법`,
        likes: 7800,
        views: 180000,
        thumb: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=600&auto=format&fit=crop&q=80",
        why: "조회수 18.0만회 · 이자 손실 방어"
      }
    ] : [
      {
        caption: `[#${cleanTopic}] 계약서에 이 특약 한 줄 안 넣으면 보증금 2억 평생 날립니다! 전세 계약 전 무조건 확인해야 할 3대 필수 특약 문구 공개`,
        likes: 21000,
        views: 520000,
        thumb: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&auto=format&fit=crop&q=80",
        why: "실시간 조회수 52.0만회 · 보증금 손실 방지 1위"
      },
      {
        caption: `[#${cleanTopic}] 2026 스트레스 DSR 3단계 시행 직전! 대출 한도 7천만원 깎이기 전에 확인해야 할 주담대 한도 시뮬레이션`,
        likes: 16800,
        views: 390000,
        thumb: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=600&auto=format&fit=crop&q=80",
        why: "조회수 39.0만회 · 한도 축소 경고"
      },
      {
        caption: `[#${cleanTopic}] 청약 가점 60점 넘어도 '이 실수' 하나로 부적격 당첨 취소됩니다. 10년간 재당첨 제한 걸리는 최악의 실수`,
        likes: 13500,
        views: 310000,
        thumb: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80",
        why: "조회수 31.0만회 · 청약 자격 박탈 방지"
      },
      {
        caption: `[#${cleanTopic}] 3기 신도시 본청약 분양가 수억 폭등... 포기해야 할까, 영끌해야 할까? 분담금 리스크 완벽 계산`,
        likes: 10400,
        views: 250000,
        thumb: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&auto=format&fit=crop&q=80",
        why: "조회수 25.0만회 · 분담금 리스크 분석"
      },
      {
        caption: `[#${cleanTopic}] 실거래가 띄우기에 속아 상투 잡히지 마세요. 가짜 신고가 구별하는 등기부 국토부 3분 검증법`,
        likes: 8900,
        views: 210000,
        thumb: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&auto=format&fit=crop&q=80",
        why: "조회수 21.0만회 · 고점 매수 방어"
      }
    ];

    rawPosts = samplePool.map((s, idx) => ({
      id: `sample_${cleanTopic}_${idx + 1}`,
      topic: cleanTopic,
      author: `@creator_${idx + 1}`,
      url: `https://www.instagram.com/p/sample_${cleanTopic}_${idx + 1}`,
      caption: s.caption,
      likesCount: s.likes,
      viewsCount: s.views,
      isVideo: true,
      videoUrl: null,
      imageUrls: [s.thumb],
      commentsCount: Math.floor(s.likes / 25),
      postedAt: new Date().toISOString(),
      thumbnail: s.thumb,
      isSample: true,
      whyHot: s.why
    }));
  }

  // 1. 좋아요 및 조회수 종합 반응도 순으로 내림차순 정렬
  const sorted = rawPosts.sort((a, b) => {
    const scoreA = (a.likesCount * 5) + (a.viewsCount || 0);
    const scoreB = (b.likesCount * 5) + (b.viewsCount || 0);
    return scoreB - scoreA;
  }).slice(0, 20);

  // 2. 랭킹 부여 및 상위 베스트 5 선별
  const enriched = sorted.map((item, index) => ({
    ...item,
    rank: index + 1,
    isTop5: index < 5,
    topBadge: index < 5 ? `👑 BEST 0${index + 1}` : `TOP ${index + 1}`
  }));

  const best5 = enriched.filter(item => item.isTop5);

  return {
    topic: cleanTopic,
    totalCollected: enriched.length,
    best5Count: best5.length,
    best5: best5,
    all20: enriched
  };
}

/**
 * 2. 특정 릴스 계정(들) 전날 00시부터 현재까지 최대 10개 수집
 */
async function fetchTargetAccountsReels(targetAccounts = ['@real_estate_king']) {
  const token = process.env.APIFY_TOKEN;
  const { timestampSec, dateStr } = getYesterdayKSTInfo();

  console.log(`[Apify 실시간 계정 수집] 대상: [${targetAccounts.join(', ')}] | 최대 10개 | 기준: ${dateStr} 이후`);

  const results = [];

  for (const acc of targetAccounts) {
    const cleanHandle = acc.trim().replace(/^@/, '');
    if (!cleanHandle) continue;

    let accountPosts = [];

    if (token && token.trim()) {
      try {
        const client = new ApifyClient({ token: token.trim() });
        const reelsUrl = `https://www.instagram.com/${cleanHandle}/reels/`;
        console.log(`[Apify] @${cleanHandle} 릴스 크롤링 시작: ${reelsUrl} (resultsType: 'reels', resultsLimit: 10, onlyPostsNewerThan: ${dateStr})`);

        const run = await client.actor('apify/instagram-scraper').call({
          directUrls: [reelsUrl],
          resultsType: 'reels',
          resultsLimit: 10,
          onlyPostsNewerThan: dateStr
        });

        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        console.log(`[Apify] @${cleanHandle} 릴스 원시 수집 완료 (${items.length}개)`);

        accountPosts = items
          .filter(item => {
            if (!item.timestamp) return true;
            const itemTimeSec = Math.floor(new Date(item.timestamp).getTime() / 1000);
            return itemTimeSec >= timestampSec;
          })
          .map((item, idx) => {
            const views = item.videoViewCount || item.videoPlayCount || 0;
            const likes = item.likesCount || 0;
            let hookTag = '최신 릴스';
            if (views >= 50000 || likes >= 2000) hookTag = '🔥 초대박 떡상';
            else if (views >= 10000 || likes >= 500) hookTag = '⚡ 떡상 릴스';

            const isVid = item.isVideo || !!item.videoUrl || item.type === 'Video';
            const vidUrl = item.videoUrl || item.video_url || null;
            const imgList = (item.images && item.images.length > 0) 
              ? item.images 
              : (item.childPosts ? item.childPosts.map(c => c.displayUrl).filter(Boolean) : [item.displayUrl].filter(Boolean));

            return {
              id: `acc_${cleanHandle}_${item.id || idx}`,
              url: item.url || (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}` : `https://www.instagram.com`),
              caption: (item.caption || '').trim() || `[@${cleanHandle}] 발행 릴스 (#${idx + 1})`,
              likesCount: likes,
              viewsCount: views,
              hookType: hookTag,
              isVideo: isVid,
              videoUrl: vidUrl,
              imageUrls: imgList,
              postedAt: item.timestamp || new Date().toISOString(),
              thumbnail: item.displayUrl || (item.images && item.images[0]) || "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80",
              isSample: false
            };
          })
          .slice(0, 10);
      } catch (err) {
        console.error(`[Apify 계정 @${cleanHandle} 수집 오류]`, err.message);
      }
    }

    results.push({
      account: `@${cleanHandle}`,
      status: accountPosts.length > 0 ? `수집 완료 (${accountPosts.length}개)` : "해당 기간 내 등록된 릴스 없음",
      count: accountPosts.length,
      posts: accountPosts
    });
  }

  return results;
}

/**
 * 3. Apify - 단일 릴스 / 게시물 URL 실시간 정밀 스크래핑
 */
async function fetchSingleInstagramPost(postUrl) {
  const token = process.env.APIFY_TOKEN;
  console.log(`[Apify 단일 릴스 수집기] URL: ${postUrl}`);

  if (!token || !token.trim()) {
    console.warn('[Apify] API 토큰이 없습니다. 기본 분석 데이터로 반환합니다.');
    return {
      success: false,
      isSample: true,
      url: postUrl,
      caption: "인스타그램 릴스 레퍼런스",
      author: "@creator",
      likesCount: 1500,
      viewsCount: 30000,
      videoUrl: null
    };
  }

  try {
    const client = new ApifyClient({ token: token.trim() });
    console.log(`[Apify] 단일 릴스 Actor 호출 시작: ${postUrl}`);

    const run = await client.actor('apify/instagram-scraper').call({
      directUrls: [postUrl.trim()],
      resultsType: 'posts',
      resultsLimit: 1
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    console.log(`[Apify] 단일 릴스 수집 완료! 아이템 수: ${items.length}`);

    if (items.length > 0) {
      const item = items[0];
      const cleanCaption = (item.caption || '').trim();
      const likes = item.likesCount || 0;
      const views = item.videoViewCount || item.videoPlayCount || 0;
      const isVid = item.isVideo || !!item.videoUrl || item.type === 'Video';
      const vidUrl = item.videoUrl || item.video_url || null;
      const imgList = (item.images && item.images.length > 0) 
        ? item.images 
        : (item.childPosts ? item.childPosts.map(c => c.displayUrl).filter(Boolean) : [item.displayUrl].filter(Boolean));

      return {
        success: true,
        isSample: false,
        id: item.id || `reel_${Date.now()}`,
        url: item.url || postUrl,
        caption: cleanCaption || "인스타그램 릴스 원본 게시물",
        author: item.ownerUsername ? `@${item.ownerUsername}` : '@creator',
        likesCount: likes,
        viewsCount: views,
        isVideo: isVid,
        videoUrl: vidUrl,
        imageUrls: imgList,
        commentsCount: item.commentsCount || 0,
        postedAt: item.timestamp || new Date().toISOString()
      };
    }
  } catch (err) {
    console.error(`[Apify 단일 릴스 수집 오류]`, err.message);
  }

  return {
    success: false,
    isSample: true,
    url: postUrl,
    caption: "인스타그램 릴스 레퍼런스",
    author: "@creator",
    likesCount: 0,
    viewsCount: 0,
    videoUrl: null
  };
}

module.exports = {
  fetchInstagramTopicTrends,
  fetchTargetAccountsReels,
  fetchSingleInstagramPost
};
