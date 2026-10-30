// State Management
let selectedTopicData = null;
let topicPosts = [];
let best5Posts = [];
let accountPosts = [];
let estateNewsList = [];
let selectedBestIds = new Set();
let isBatchRunning = false;

// DOM Elements
const topicContainer = document.getElementById('topic-cards-container');
const best5Container = document.getElementById('best5-cards-container');
const best5Section = document.getElementById('best-5-section');
const bestSelectAll = document.getElementById('best-select-all');
const btnBatchGenerate = document.getElementById('btn-batch-generate');
const batchProgress = document.getElementById('batch-progress');
const batchProgressHead = document.getElementById('batch-progress-head');
const batchLog = document.getElementById('batch-log');
const accountsContainer = document.getElementById('accounts-cards-container');
const estateContainer = document.getElementById('estate-cards-container');
const selectedTopicBox = document.getElementById('selected-topic-box');
const startRenderBtn = document.getElementById('start-render-btn');
const resultZone = document.getElementById('result-zone');
const galleryGrid = document.getElementById('gallery-grid');

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    
    btn.classList.add('active');
    const targetTab = btn.getAttribute('data-tab');
    document.getElementById(targetTab).style.display = 'block';
  });
});

// Global Lock State
let isGlobalBusy = false;

/**
 * 3초 쿨다운 타이머 유틸리티
 */
function startCooldown(btn, originalHtml, cooldownSec = 3) {
  let remaining = cooldownSec;
  btn.disabled = true;
  btn.style.cursor = 'not-allowed';
  btn.style.opacity = '0.6';
  btn.innerHTML = `<span>⏳</span> 쿨다운 중 (${remaining}초)`;

  const interval = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      btn.innerHTML = `<span>⏳</span> 쿨다운 중 (${remaining}초)`;
    } else {
      clearInterval(interval);
      btn.disabled = false;
      btn.style.cursor = 'pointer';
      btn.style.opacity = '1';
      btn.innerHTML = originalHtml;
      isGlobalBusy = false;
    }
  }, 1000);
}

/**
 * 샘플(예시) 데이터 배지 — Apify 수집 실패/토큰 미설정 시 실제 게시물로 오인하지 않도록 표시한다.
 */
const SAMPLE_BADGE_HTML = '<span class="media-badge" style="background: rgba(251, 191, 36, 0.18); color: #FBBF24; border: 1px solid rgba(251, 191, 36, 0.35);" title="Apify 수집 실패 또는 APIFY_TOKEN 미설정으로 생성된 예시 데이터입니다">🧪 샘플</span>';

function sampleBadge(item) {
  return item && item.isSample ? SAMPLE_BADGE_HTML : '';
}

function sampleNoticeHtml(sampleCount, total) {
  if (!sampleCount) return '';
  return `<div style="grid-column: 1 / -1; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(251, 191, 36, 0.35); background: rgba(251, 191, 36, 0.08); color: #FBBF24; font-size: 12px; font-weight: 700; line-height: 1.5;">
    🧪 샘플 데이터 ${sampleCount}/${total}건 · Apify 수집에 실패했거나 APIFY_TOKEN이 설정되지 않아 예시 게시물로 표시됩니다. 실제 인스타그램 게시물 분석 결과가 아닙니다.
  </div>`;
}

/**
 * 피드 카드 제목 정제 (첫 2~3문장 추출, 잡다한 해시태그 정리하여 깔끔하게 표시)
 */
function cleanDisplayTitle(caption = '') {
  if (!caption) return '최신 3대 분야 트렌드';
  // 해시태그 제거 및 줄바꿈 정리
  const cleaned = caption
    .replace(/#[^\s#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (cleaned.length === 0) {
    return caption.slice(0, 50);
  }
  // 최대 65자로 제한하여 2~3줄에 딱 맞게 자름
  return cleaned.length > 65 ? cleaned.slice(0, 65) + '...' : cleaned;
}

// 1. [탭 1] 주제별 20개 수집 및 베스트 5 선별
async function collectTopicTrends() {
  if (isGlobalBusy) return;
  
  const keyword = document.getElementById('topic-keyword-input').value.trim();
  if (!keyword) {
    return alert('수집하고 싶은 관심 주제(키워드)를 입력해주세요!\n예: 부동산, 청약, 대출, AI 등');
  }

  isGlobalBusy = true;
  const btn = document.getElementById('btn-collect-topic');
  const originalHtml = '<span>🔥</span> 20개 수집 및 베스트 5 선별';

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> 20개 수집 & 베스트 5 분석 중...';
  topicContainer.innerHTML = `<div style="padding: 30px; color: var(--text-muted); text-align: center;">'${keyword}' 관련 어제 0시 이후 20개 수집 및 랭킹 분석 중...</div>`;
  best5Section.style.display = 'none';

  try {
    const res = await fetch('/api/collect/topic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: keyword })
    });
    const data = await res.json();
    const result = data.data || {};
    best5Posts = result.best5 || [];
    topicPosts = result.all20 || [];
    selectedBestIds.clear();
    document.getElementById('batch-progress').style.display = 'none';
    document.getElementById('batch-log').innerHTML = '';
    renderBest5Cards();

    // Render All 20
    if (topicPosts.length === 0) {
      topicContainer.innerHTML = '<div style="padding: 30px; color: var(--text-muted); text-align: center;">어제 0시 이후 올라온 게시물이 없습니다.</div>';
    } else {
      topicContainer.innerHTML = sampleNoticeHtml(topicPosts.filter(p => p.isSample).length, topicPosts.length) + topicPosts.map(p => {
        const titleText = cleanDisplayTitle(p.caption);
        const isReel = p.isVideo || !!p.videoUrl;
        const mediaBadge = isReel 
          ? '<span class="media-badge reel">🎬 릴스</span>' 
          : '<span class="media-badge cardnews">📑 카드뉴스</span>';

        return `
          <div class="feed-card" onclick="selectPost('${escapeHtml(p.id)}', 'topic')">
            <div>
              <div class="card-top-meta">
                <div class="card-top-left">
                  <span class="card-tag">${escapeHtml(p.topBadge)}</span>
                  ${mediaBadge}
                  ${sampleBadge(p)}
                </div>
                <a href="${escapeHtml(p.url)}" target="_blank" class="origin-link" onclick="event.stopPropagation();" title="인스타그램에서 원본 게시물 보기">🔗 원본 보기 ↗</a>
              </div>
              <div class="card-title" title="${escapeHtml(p.caption)}">${escapeHtml(titleText)}</div>
              <div class="card-snippet">🔥 ${escapeHtml(p.whyHot)}</div>
            </div>
            <div class="card-footer-meta">
              <span style="color: var(--accent-orange); font-weight: 700; font-size: 13px;">❤️ ${Number(p.likesCount || 0).toLocaleString()}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.author)}</span>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    topicContainer.innerHTML = '<div style="padding: 30px; color: #EF4444; text-align: center;">수집 실패: 다시 시도해 주세요.</div>';
  } finally {
    startCooldown(btn, originalHtml, 3);
  }
}

// 1-1. 베스트 TOP 5 선택 & 일괄 생성
function renderBest5Cards() {
  if (best5Posts.length === 0) {
    best5Section.style.display = 'none';
    updateBatchToolbar();
    return;
  }

  best5Section.style.display = 'block';
  best5Container.innerHTML = sampleNoticeHtml(best5Posts.filter(p => p.isSample).length, best5Posts.length) + best5Posts.map(p => {
    const titleText = cleanDisplayTitle(p.caption);
    const isReel = p.isVideo || !!p.videoUrl;
    const mediaBadge = isReel
      ? '<span class="media-badge reel">🎬 릴스</span>'
      : '<span class="media-badge cardnews">📑 카드뉴스</span>';
    const selected = selectedBestIds.has(p.id);

    return `
      <div class="feed-card ${selected ? 'batch-selected' : ''}" data-post-id="${escapeHtml(p.id)}" style="border-color: var(--accent-orange); background: linear-gradient(180deg, #221815 0%, var(--bg-surface) 100%);" onclick="selectPost('${escapeHtml(p.id)}', 'topic')">
        <div>
          <div class="card-top-meta">
            <div class="card-top-left">
              <label class="batch-check" title="일괄 생성 선택" onclick="event.stopPropagation()">
                <input type="checkbox" ${selected ? 'checked' : ''} onchange="toggleBestSelection('${escapeHtml(p.id)}', this.checked)">
              </label>
              <span class="card-tag" style="background: var(--accent-orange); color: #fff;">${escapeHtml(p.topBadge)}</span>
              ${mediaBadge}
              ${sampleBadge(p)}
            </div>
            <a href="${escapeHtml(p.url)}" target="_blank" class="origin-link" onclick="event.stopPropagation();" title="인스타그램에서 원본 게시물 보기">🔗 원본 보기 ↗</a>
          </div>
          <div class="card-title" title="${escapeHtml(p.caption)}">${escapeHtml(titleText)}</div>
          <div class="card-snippet">🔥 ${escapeHtml(p.whyHot)}</div>
        </div>
        <div class="card-footer-meta">
          <span style="color: var(--accent-orange); font-weight: 800; font-size: 13px;">❤️ ${Number(p.likesCount || 0).toLocaleString()}</span>
          <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.author)}</span>
        </div>
      </div>
    `;
  }).join('');

  updateBatchToolbar();
}

function updateBatchToolbar() {
  const total = best5Posts.length;
  const count = best5Posts.filter(p => selectedBestIds.has(p.id)).length;
  btnBatchGenerate.innerHTML = `<span>⚡</span> 선택 ${count}개 일괄생성`;
  btnBatchGenerate.disabled = count === 0 || isBatchRunning;
  bestSelectAll.checked = total > 0 && count === total;
  bestSelectAll.indeterminate = count > 0 && count < total;
  bestSelectAll.disabled = total === 0 || isBatchRunning;
}

window.toggleBestSelection = function(id, checked) {
  if (checked) selectedBestIds.add(id);
  else selectedBestIds.delete(id);

  const card = best5Container.querySelector(`[data-post-id="${id}"]`);
  if (card) card.classList.toggle('batch-selected', checked);
  updateBatchToolbar();
};

bestSelectAll.addEventListener('change', () => {
  selectedBestIds.clear();
  if (bestSelectAll.checked) {
    best5Posts.forEach(p => selectedBestIds.add(p.id));
  }
  best5Container.querySelectorAll('.batch-check input').forEach(cb => { cb.checked = bestSelectAll.checked; });
  best5Container.querySelectorAll('[data-post-id]').forEach(el => el.classList.toggle('batch-selected', bestSelectAll.checked));
  updateBatchToolbar();
});

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ error: '응답을 읽을 수 없습니다.' }));
  if (!data.success) throw new Error(data.error || '요청이 실패했습니다.');
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function escapeBatchText(value) {
  return escapeHtml(value);
}

function appendBatchLog(html) {
  const line = document.createElement('div');
  line.innerHTML = html;
  batchLog.appendChild(line);
  batchLog.scrollTop = batchLog.scrollHeight;
}

function topicDataFromPost(post) {
  const isReel = post.isVideo || !!post.videoUrl;
  return {
    topic: cleanDisplayTitle(post.caption),
    caption: post.caption,
    summary: post.whyHot,
    source: post.author,
    url: post.url,
    videoUrl: post.videoUrl || null,
    imageUrls: post.imageUrls || [],
    likesCount: post.likesCount || 0,
    viewsCount: post.viewsCount || 0,
    mediaType: isReel ? 'reel' : 'cardnews'
  };
}

async function generateOnePost(post, index, total) {
  const title = cleanDisplayTitle(post.caption);
  appendBatchLog(`<div style="color:#E5E7EB; font-weight:800; margin-top:4px;">${index + 1}/${total} · ${escapeBatchText(title.slice(0, 60))}</div>`);

  const topicData = topicDataFromPost(post);

  appendBatchLog('&nbsp;&nbsp;🔍 딥분석 중...');
  const analysis = await postJson('/api/analyze-multimodal', {
    topic: topicData.topic,
    caption: topicData.caption,
    videoUrl: topicData.videoUrl,
    imageUrls: topicData.imageUrls,
    likesCount: topicData.likesCount,
    viewsCount: topicData.viewsCount
  });

  const angles = analysis.top3Angles || [];
  const angle = angles.find(a => a.id === savedAngleId) || angles[0];
  if (!angle) throw new Error('추천 관점이 없습니다.');

  appendBatchLog(`&nbsp;&nbsp;✍️ 대본 생성 중... (${escapeBatchText(angle.title)})`);
  const scriptRes = await postJson('/api/generate-advanced-script', {
    topic: topicData.topic,
    angleId: angle.id,
    slideCount: slideCountSelect.value,
    userFeedback: userFeedbackInput.value,
    customHook: angle.customHook || '',
    coreContext: {
      caption: topicData.caption,
      audioText: analysis.audioText,
      imageText: analysis.imageText
    }
  });

  appendBatchLog('&nbsp;&nbsp;📁 리포트 저장 중...');
  const saveRes = await postJson('/api/save-report', {
    topicData,
    multimodalData: analysis,
    selectedAngle: angle,
    script: scriptRes.script
  });

  let script = scriptRes.script;
  let imageNote = '이미지 없음';
  try {
    appendBatchLog('&nbsp;&nbsp;🖼️ AI 이미지 생성 중...');
    const imgRes = await postJson('/api/generate-images', { script, folderName: saveRes.folderName });
    if (imgRes.script) script = imgRes.script;
    imageNote = `${imgRes.generated.length}장 생성`;
  } catch (imageErr) {
    imageNote = '이미지 실패';
    appendBatchLog(`&nbsp;&nbsp;⚠️ 이미지 실패: ${escapeBatchText(imageErr.message)}`);
  }

  appendBatchLog('&nbsp;&nbsp;🎨 PNG 렌더 중...');
  const renderRes = await postJson('/api/render', {
    script,
    folderName: saveRes.folderName,
    theme: getCardTheme()
  });

  const fontNote = renderRes.warnings?.length ? ` · ⚠️ 폰트 대체(${renderRes.warnings.join(',')})` : '';
  appendBatchLog(`&nbsp;&nbsp;✅ 완료 · ${renderRes.images.length}장 PNG · ${imageNote}${fontNote} · <a href="${escapeHtml(renderRes.images[0])}" target="_blank" style="color:#A5B4FC;">첫 장 보기 ↗</a>`);
  return { title, folder: saveRes.folderName, images: renderRes.images, imageNote };
}

async function runBatchGeneration() {
  if (isBatchRunning) return;

  const posts = best5Posts.filter(p => selectedBestIds.has(p.id));
  if (posts.length === 0) return;

  const sampleCount = posts.filter(p => p.isSample).length;
  const confirmed = confirm(
    `선택한 ${posts.length}개 항목을 일괄 생성합니다.\n\n` +
    (sampleCount > 0 ? `⚠️ 샘플 데이터 ${sampleCount}개가 포함되어 있습니다. 실제 인스타그램 게시물 분석이 아닙니다.\n\n` : '') +
    '항목마다 딥분석 → 대본 생성 → 리포트 저장 → AI 이미지 생성 → PNG 렌더가 순서대로 실행됩니다.\n' +
    'OpenAI 크레딧이 사용됩니다. 계속할까요?'
  );
  if (!confirmed) return;

  isBatchRunning = true;
  isGlobalBusy = true;
  updateBatchToolbar();

  batchProgress.style.display = 'block';
  batchLog.innerHTML = '';
  batchProgressHead.innerText = `일괄 생성 준비 중... 0 / ${posts.length}`;

  const results = [];

  for (const [index, post] of posts.entries()) {
    batchProgressHead.innerText = `일괄 생성 중... ${index} / ${posts.length}`;
    try {
      const result = await generateOnePost(post, index, posts.length);
      results.push({ ...result, ok: true });
    } catch (err) {
      appendBatchLog(`&nbsp;&nbsp;❌ 실패: ${escapeBatchText(err.message)}`);
      results.push({ title: cleanDisplayTitle(post.caption), ok: false, error: err.message });
    }
    batchProgressHead.innerText = `일괄 생성 중... ${index + 1} / ${posts.length}`;
  }

  const okCount = results.filter(r => r.ok).length;
  batchProgressHead.innerText = `일괄 생성 완료 · 성공 ${okCount} / ${posts.length}`;

  isBatchRunning = false;
  isGlobalBusy = false;
  updateBatchToolbar();

  const failed = results.filter(r => !r.ok);
  alert(`일괄 생성 완료: 성공 ${okCount}개 / 전체 ${posts.length}개` +
    (failed.length ? `\n\n실패 ${failed.length}개\n${failed.map(r => `- ${r.title}: ${r.error}`).join('\n')}` : ''));
}

btnBatchGenerate.addEventListener('click', runBatchGeneration);

// 2. [탭 2] 특정 계정 릴스 전수 수집
async function collectAccountReels() {
  if (isGlobalBusy) return;
  isGlobalBusy = true;

  const accountsInput = document.getElementById('accounts-input').value.trim();
  const btn = document.getElementById('btn-collect-accounts');
  const originalHtml = '<span>👥</span> 계정 릴스 전수 수집';

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> 릴스 전수 수집 중...';
  accountsContainer.innerHTML = '<div style="padding: 30px; color: var(--text-muted); text-align: center;">지정된 계정의 전날 00시 이후 최신 릴스 전수 수집 중...</div>';

  try {
    const res = await fetch('/api/collect/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts: accountsInput })
    });
    const data = await res.json();
    accountPosts = [];
    (data.data || []).forEach(acc => {
      (acc.posts || []).forEach(p => {
        accountPosts.push({ ...p, accountName: acc.account });
      });
    });
    renderAccountCards(accountPosts);
  } catch (err) {
    accountsContainer.innerHTML = '<div style="padding: 30px; color: #EF4444; text-align: center;">계정 수집 실패</div>';
  } finally {
    startCooldown(btn, originalHtml, 3);
  }
}

function renderAccountCards(posts) {
  if (posts.length === 0) {
    accountsContainer.innerHTML = '<div style="padding: 30px; color: var(--text-muted); text-align: center;">전날 00시 이후 올라온 릴스가 없습니다.</div>';
    return;
  }
  accountsContainer.innerHTML = posts.map(p => {
    const titleText = cleanDisplayTitle(p.caption);
    const views = Number(p.viewsCount || 0).toLocaleString();
    const likes = Number(p.likesCount || 0).toLocaleString();
    return `
      <div class="feed-card" onclick="selectPost('${escapeHtml(p.id)}', 'account')">
        <div>
          <div class="card-top-meta">
            <div class="card-top-left">
              <span class="card-tag" style="background: var(--accent-blue-soft); color: var(--accent-blue);">${escapeHtml(p.hookType || '최신릴스')}</span>
              <span class="media-badge reel">🎬 릴스</span>
              ${sampleBadge(p)}
            </div>
            <a href="${escapeHtml(p.url)}" target="_blank" class="origin-link" onclick="event.stopPropagation();">🔗 원본 릴스 ↗</a>
          </div>
          <div class="card-title" title="${escapeHtml(p.caption)}">${escapeHtml(titleText)}</div>
          <div class="card-snippet">👁️ 조회수 ${views}회 · 좋아요 ${likes}개</div>
        </div>
        <div class="card-footer-meta">
          <span style="color: var(--accent-orange); font-weight: 700;">❤️ ${likes}</span>
          <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(p.accountName)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 3. [탭 3] 네이버 실시간 핫이슈 뉴스 (부동산·시사·재테크) 자동 수집
let currentNewsCategory = 'all';

async function collectEstateData(category) {
  if (isGlobalBusy) return;
  isGlobalBusy = true;

  if (category) currentNewsCategory = category;
  const targetCat = currentNewsCategory || 'all';

  const btn = document.getElementById('btn-collect-estate');
  const originalHtml = '<span>⚡</span> 속보 수집';

  const catNames = { all: '전체', estate: '부동산', politics: '시사', finance: '재테크' };
  btn.disabled = true;
  btn.innerHTML = `<span>⏳</span> [${catNames[targetCat] || '뉴스'}] 수집 중...`;
  estateContainer.innerHTML = `<div style="padding: 30px; color: var(--text-muted); text-align: center;">네이버 실시간 [${catNames[targetCat] || '핫이슈'}] 손실회피 뉴스 속보 수집 중...</div>`;
  document.getElementById('top-picks-section').style.display = 'none';

  try {
    const res = await fetch('/api/collect/estate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: targetCat })
    });
    const data = await res.json();
    estateNewsList = data.data || [];
    renderTopPicks(data.topPicks || [], data.counts || {}, data.policyCount || 0);
    renderEstateCards(estateNewsList, targetCat);
  } catch (err) {
    estateContainer.innerHTML = '<div style="padding: 30px; color: #EF4444; text-align: center;">핫이슈 뉴스 수집 실패</div>';
  } finally {
    startCooldown(btn, originalHtml, 3);
  }
}

const ANGLE_LABELS = {
  angle_warning: '🚨 경고형',
  angle_cheat: '📋 체크리스트형',
  angle_calc: '🔢 계산기형',
  angle_easy: '💡 3분 요약형',
  angle_vs: '⚖️ VS 비교형',
  angle_story: '📈 실화형',
  angle_target: '🎯 타겟팅형'
};

function renderTopPicks(picks, counts, policyCount) {
  const section = document.getElementById('top-picks-section');
  const container = document.getElementById('top-picks-container');
  const meta = document.getElementById('top-picks-meta');

  if (!picks || picks.length === 0) {
    section.style.display = 'none';
    return;
  }

  meta.innerText = `부동산 ${counts.estate || 0} · 시사 ${counts.politics || 0} · 재테크 ${counts.finance || 0}건 중 · 정책 연관 ${policyCount}건`;

  container.innerHTML = picks.map((p, idx) => `
    <div class="top-pick-card" onclick="selectPost('${escapeHtml(p.id)}', 'estate')">
      <div class="top-pick-rank">${idx + 1}</div>
      <div class="top-pick-body">
        <div class="top-pick-meta">
          <span class="top-pick-field field-${escapeHtml(p.field)}">${escapeHtml(p.fieldLabel)}</span>
          <span class="top-pick-angle">${ANGLE_LABELS[p.suggestedAngle] || '기획형'}</span>
          <span class="top-pick-score">${Number(p.walletScore ?? 0)}점</span>
        </div>
        <div class="top-pick-title">${escapeHtml(p.title)}</div>
        <div class="top-pick-sub">
          <span>${escapeHtml(p.relevance || '')} · ${escapeHtml(p.press)}</span>
          <a href="${escapeHtml(p.url)}" target="_blank" class="origin-link" onclick="event.stopPropagation();">원문 ↗</a>
        </div>
      </div>
    </div>
  `).join('');

  section.style.display = 'block';
}

function renderEstateCards(list, targetCat = 'all') {
  if (list.length === 0) {
    const emptyMsg = targetCat === 'politics'
      ? '오늘은 내 지갑에 직접 닿는 정책 뉴스가 없습니다.<br><span style="font-size:12px; color:var(--text-light);">시사는 정치 행사·사건사고가 아니라 세제·부동산·노동·연금 제도 변화만 소재로 씁니다. 위 #세제개편 태그로 인스타 트렌드를 확인해보세요.</span>'
      : '수집된 데이터가 없습니다.';
    estateContainer.innerHTML = `<div style="padding: 30px; color: var(--text-muted); text-align: center; line-height: 1.6;">${emptyMsg}</div>`;
    return;
  }

  estateContainer.innerHTML = list.map(item => {
    // 카테고리별 태그 컬러링
    let tagStyle = 'background: rgba(16, 185, 129, 0.15); color: var(--accent-green);';
    const tag = item.tag || '';
    if (tag.includes('시사') || tag.includes('세제') || tag.includes('노동') || tag.includes('복지') || tag.includes('교육')) {
      tagStyle = 'background: rgba(248, 113, 113, 0.2); color: #F87171;';
    } else if (tag.includes('재테크') || tag.includes('세금')) {
      tagStyle = 'background: rgba(52, 211, 153, 0.2); color: #34D399;';
    } else if (tag.includes('부동산') || tag.includes('청약') || tag.includes('대출') || tag.includes('시세')) {
      tagStyle = 'background: rgba(96, 165, 250, 0.2); color: #60A5FA;';
    }

    const isLossAlert = (item.relevance || '').includes('지갑') || (item.importance || '').includes('경고');
    const badgeColor = isLossAlert ? '#F87171' : 'var(--accent-orange)';

    return `
      <div class="feed-card" onclick="selectPost('${escapeHtml(item.id)}', 'estate')" style="border-color: ${item.walletScore >= 60 ? 'rgba(248,113,113,0.35)' : 'var(--border-subtle)'};">
        <div>
          <div class="card-top-meta">
            <div class="card-top-left">
              <span class="card-tag" style="${tagStyle}">${escapeHtml(item.tag || item.source)}</span>
              <span class="media-badge" style="background: rgba(255, 255, 255, 0.08); color: #E5E7EB;">${escapeHtml(item.fieldLabel || '속보')}</span>
            </div>
            <a href="${escapeHtml(item.url)}" target="_blank" class="origin-link" onclick="event.stopPropagation();">🔗 원문 기사 ↗</a>
          </div>
          <div class="card-title">${escapeHtml(item.title)}</div>
          <div class="card-snippet">${escapeHtml(item.summary || '')}</div>
        </div>
        <div class="card-footer-meta">
          <span style="color: ${badgeColor}; font-weight: 700;">${escapeHtml(item.relevance || '최신 브리핑')}</span>
          <span style="display:flex; align-items:center; gap:8px;">
            <span style="font-size: 11px; font-weight: 800; color: ${item.walletScore >= 60 ? '#F87171' : 'var(--text-muted)'};">적합도 ${item.walletScore ?? '-'}점</span>
            <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.source)}</span>
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// 4. [탭 4] 릴스 URL 역분석 (실제 캡션·지표를 GPT로 분석)
async function analyzeReelsUrl() {
  if (isGlobalBusy) return;

  const url = document.getElementById('reels-url-input').value.trim();
  if (!url) return alert('릴스 URL을 입력해주세요.');

  isGlobalBusy = true;
  const btn = document.getElementById('btn-analyze-reels');
  const originalHtml = '<span>🔍</span> 구조 역분석';
  const resBox = document.getElementById('reels-analysis-result');
  const content = document.getElementById('reels-analysis-content');
  const applyBtn = document.getElementById('apply-reels-btn');

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> 캡션 수집 & 구조 분석 중...';

  try {
    const res = await fetch('/api/analyze-reels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({ success: false, error: '응답을 읽을 수 없습니다.' }));
    if (!data.success) throw new Error(data.error || '역분석에 실패했습니다.');

    const post = data.postData || {};
    const analysis = data.analysis || {};
    const caption = post.caption || '';
    const authorText = post.author || '@instagram_creator';
    const hasMetrics = Number.isFinite(post.viewsCount) || Number.isFinite(post.likesCount);
    const statsText = hasMetrics
      ? `👁️ 조회수 ${Number(post.viewsCount || 0).toLocaleString()}회 · ❤️ 좋아요 ${Number(post.likesCount || 0).toLocaleString()}개`
      : '성과 지표 미제공';
    const tacticsHtml = (analysis.tactics || []).length
      ? `<ul style="margin: 4px 0 0 18px; padding: 0;">${analysis.tactics.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
      : '';

    resBox.style.display = 'flex';
    document.getElementById('reels-analysis-title').innerText = '📊 역분석 완료';
    content.innerHTML = `
      <div style="background: rgba(0,0,0,0.25); padding: 10px 14px; border-radius: 8px; margin-bottom: 8px;">
        <div style="font-size: 12px; color: var(--accent-orange); font-weight: 800;">${escapeHtml(authorText)} · ${statsText}</div>
        <div style="font-size: 13px; color: var(--text-main); margin-top: 4px; line-height: 1.4;">${escapeHtml(caption.slice(0, 150))}${caption.length > 150 ? '...' : ''}</div>
      </div>
      <div><strong>🎯 후킹 패턴:</strong> ${escapeHtml(analysis.hookPattern || '추정 불가')}</div>
      ${analysis.hookText ? `<div><strong>✍️ 실제 후킹 문장:</strong> "${escapeHtml(analysis.hookText)}"</div>` : ''}
      <div><strong>🧱 전개 구조:</strong> ${escapeHtml(analysis.pacing || '')}</div>
      ${analysis.whyHot ? `<div><strong>🔥 반응 요인:</strong> ${escapeHtml(analysis.whyHot)}</div>` : ''}
      ${tacticsHtml ? `<div><strong>🛠️ 재현 포인트:</strong>${tacticsHtml}</div>` : ''}
      <div><strong>💡 재해석 가이드:</strong> ${escapeHtml(analysis.advice || '')}</div>
      <div><strong>🧭 추천 관점:</strong> ${ANGLE_LABELS[analysis.recommendedFormula] || '기획형'}</div>
      <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">※ 캡션과 성과 지표 기반 추정 분석입니다. 영상 속 음성은 분석하지 않습니다.</div>
      <div><strong>🔗 원본 릴스:</strong> <a href="${escapeHtml(post.url || url)}" target="_blank" style="color: var(--accent-blue); text-decoration: underline;">${escapeHtml(url)}</a></div>
    `;

    applyBtn.style.display = 'inline-flex';
    applyBtn.onclick = () => {
      if (!caption) return alert('캡션이 없어 스튜디오로 담을 수 없습니다.');
      const hasImages = post.imageUrls && post.imageUrls.length > 0;
      const isReelVideo = post.isVideo || (post.videoUrl && !hasImages);

      selectedTopicData = {
        topic: `[인스타 분석] ${caption.slice(0, 30).replace(/\n/g, ' ')}...`,
        caption,
        summary: caption.slice(0, 200).replace(/\n/g, ' '),
        source: `${authorText} (인스타그램)`,
        url: post.url || url,
        videoUrl: post.videoUrl || (isReelVideo ? (post.url || url) : null),
        imageUrls: post.imageUrls || [],
        likesCount: post.likesCount ?? null,
        viewsCount: post.viewsCount ?? null,
        mediaType: isReelVideo ? 'reel' : (hasImages ? 'cardnews' : 'reel')
      };
      updateStudioStep1();
    };
  } catch (err) {
    resBox.style.display = 'flex';
    applyBtn.style.display = 'none';
    document.getElementById('reels-analysis-title').innerText = '⚠️ 역분석 실패';
    content.innerHTML = `<div style="color: #F87171; font-weight: 700; line-height: 1.5;">${escapeHtml(err.message)}</div>`;
  } finally {
    startCooldown(btn, originalHtml, 3);
  }
}

// State Management for 4-Step Interactive Studio
let multimodalAnalysisData = null;
let selectedAngleId = 'angle_warning';
let savedAngleId = 'angle_warning';
let generatedCardScript = null;

// DOM Elements for 4-Step Studio
const sttStatusBadge = document.getElementById('stt-status-badge');
const btnDeepAnalyze = document.getElementById('btn-deep-analyze');
const deepAnalysisBox = document.getElementById('deep-analysis-box');
const deepAnalysisSummary = document.getElementById('deep-analysis-summary');
const sttTextPreview = document.getElementById('stt-text-preview');
const sectionAngles = document.getElementById('section-angles');
const anglesGrid = document.getElementById('angles-grid');
const sectionFeedback = document.getElementById('section-feedback');
const slideCountSelect = document.getElementById('slide-count-select');
const userFeedbackInput = document.getElementById('user-feedback-input');
const btnGenerateScript = document.getElementById('btn-generate-script');
const scriptPreviewBox = document.getElementById('script-preview-box');
const scriptPreviewContent = document.getElementById('script-preview-content');
const scriptSlidesBadge = document.getElementById('script-slides-badge');
const sectionRender = document.getElementById('section-render');
const btnSaveReport = document.getElementById('btn-save-report');
const btnRenderCards = document.getElementById('btn-render-cards');
const cardsGallery = document.getElementById('cards-gallery');
const btnGenerateImages = document.getElementById('btn-generate-images');
const imagesPreview = document.getElementById('images-preview');
const themeBgInput = document.getElementById('theme-bg');
const themeTitleInput = document.getElementById('theme-title');
const themeAccentInput = document.getElementById('theme-accent');
const btnResetTheme = document.getElementById('btn-reset-theme');
const themeContrastWarning = document.getElementById('theme-contrast-warning');

const DEFAULT_CARD_THEME = { bg: '#F7F5F0', title: '#191A1E', accent: '#D9532F' };

function relativeLuminance(hex) {
  const v = hex.replace('#', '');
  const rgb = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function updateThemeContrastWarning() {
  const ratio = contrastRatio(themeBgInput.value, themeTitleInput.value);
  themeContrastWarning.style.display = ratio < 3 ? 'block' : 'none';
}

function getCardTheme() {
  return {
    bg: themeBgInput.value,
    title: themeTitleInput.value,
    accent: themeAccentInput.value
  };
}

let pendingSettings = {};
let settingsTimer = null;

function persistSettings(patch) {
  Object.assign(pendingSettings, patch);
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    const body = pendingSettings;
    pendingSettings = {};
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => { /* 저장 실패는 무시하고 다음 변경에서 재시도 */ });
  }, 350);
}

function applyCardTheme(theme, options = {}) {
  themeBgInput.value = theme.bg || DEFAULT_CARD_THEME.bg;
  themeTitleInput.value = theme.title || DEFAULT_CARD_THEME.title;
  themeAccentInput.value = theme.accent || DEFAULT_CARD_THEME.accent;
  updateThemeContrastWarning();
  try {
    localStorage.setItem('cardnews_theme', JSON.stringify(getCardTheme()));
  } catch (e) { /* storage unavailable */ }
  if (options.persist) persistSettings({ theme: getCardTheme() });
}

function applySettings(settings = {}) {
  if (settings.theme) applyCardTheme(settings.theme);
  if (settings.slideCount && slideCountSelect) slideCountSelect.value = String(settings.slideCount);
  if (typeof settings.userFeedback === 'string' && userFeedbackInput) userFeedbackInput.value = settings.userFeedback;
  if (settings.selectedAngleId) savedAngleId = settings.selectedAngleId;
}

(async function loadServerSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!data.success) return;
    if (data.exists) {
      applySettings(data.settings);
    } else {
      persistSettings({
        theme: getCardTheme(),
        slideCount: slideCountSelect.value,
        userFeedback: userFeedbackInput.value,
        selectedAngleId: savedAngleId
      });
    }
  } catch (e) { /* 서버 설정이 없으면 localStorage 기본값 사용 */ }
})();

(function initCardTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem('cardnews_theme') || 'null');
    if (saved) applyCardTheme(saved);
  } catch (e) { /* ignore */ }

  [themeBgInput, themeTitleInput, themeAccentInput].forEach(input => {
    input.addEventListener('input', () => applyCardTheme(getCardTheme(), { persist: true }));
  });

  btnResetTheme.addEventListener('click', () => applyCardTheme(DEFAULT_CARD_THEME, { persist: true }));

  document.querySelectorAll('.theme-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      applyCardTheme({
        bg: btn.getAttribute('data-bg'),
        title: btn.getAttribute('data-title'),
        accent: btn.getAttribute('data-accent')
      }, { persist: true });
    });
  });

  slideCountSelect.addEventListener('change', () => persistSettings({ slideCount: slideCountSelect.value }));
  userFeedbackInput.addEventListener('input', () => persistSettings({ userFeedback: userFeedbackInput.value }));
})();
const savedFolderBadge = document.getElementById('saved-folder-badge');
const savedFilePath = document.getElementById('saved-file-path');
const reportMarkdownPreview = document.getElementById('report-markdown-preview');

// 1. 피드 아이템 선택 (Step 1 활성화 및 미디어 유형 정밀 매핑)
window.selectPost = function(id, type) {
  let target = null;
  if (type === 'topic') {
    target = topicPosts.find(p => p.id === id) || best5Posts.find(p => p.id === id);
    if (target) {
      const isReel = target.isVideo || !!target.videoUrl;
      selectedTopicData = {
        topic: cleanDisplayTitle(target.caption),
        caption: target.caption,
        summary: target.whyHot,
        source: target.author,
        url: target.url,
        videoUrl: target.videoUrl || null,
        imageUrls: target.imageUrls || [],
        likesCount: target.likesCount || 0,
        viewsCount: target.viewsCount || 0,
        mediaType: isReel ? 'reel' : 'cardnews'
      };
    }
  } else if (type === 'account') {
    target = accountPosts.find(p => p.id === id);
    if (target) {
      const isReel = target.isVideo || !!target.videoUrl;
      selectedTopicData = {
        topic: cleanDisplayTitle(target.caption),
        caption: target.caption,
        summary: `조회수 ${target.viewsCount?.toLocaleString() || 0}회 · 좋아요 ${target.likesCount?.toLocaleString() || 0}개`,
        source: target.accountName,
        url: target.url,
        videoUrl: target.videoUrl || null,
        imageUrls: target.imageUrls || [],
        likesCount: target.likesCount || 0,
        viewsCount: target.viewsCount || 0,
        mediaType: isReel ? 'reel' : 'cardnews'
      };
    }
  } else if (type === 'estate') {
    target = estateNewsList.find(n => n.id === id);
    if (target) {
      selectedTopicData = {
        topic: target.title,
        caption: target.summary || target.title,
        summary: target.summary,
        source: target.source,
        url: target.url,
        // 뉴스 기사는 좋아요/조회수 지표가 없다. 임의의 숫자를 넣지 않는다.
        likesCount: null,
        viewsCount: null,
        mediaType: 'estate',
        walletScore: target.walletScore,
        relevance: target.relevance,
        suggestedAngle: target.suggestedAngle,
        fieldLabel: target.fieldLabel
      };
    }
  }

  updateStudioStep1();
};

function updateStudioStep1() {
  if (!selectedTopicData) return;

  const isReel = selectedTopicData.mediaType === 'reel' || !!selectedTopicData.videoUrl;
  const isCardNews = selectedTopicData.mediaType === 'cardnews';

  let mediaBadgeHtml = '';
  let btnAnalyzeText = '';
  let badgeStatusText = '';

  if (isReel) {
    mediaBadgeHtml = '<span class="media-badge reel" style="margin-left: 6px;">🎬 인스타 릴스 영상</span>';
    btnAnalyzeText = '<span>🎙️</span> 릴스 음성 STT & 4대 심층 분석 시작';
    badgeStatusText = '릴스 음성 STT 분석 대기';
  } else if (isCardNews) {
    mediaBadgeHtml = '<span class="media-badge cardnews" style="margin-left: 6px;">📑 카드뉴스 이미지</span>';
    btnAnalyzeText = '<span>👁️</span> 카드 슬라이드 Vision & 4대 심층 분석 시작';
    badgeStatusText = '카드 이미지 Vision 분석 대기';
  } else {
    mediaBadgeHtml = '<span class="media-badge" style="background: rgba(16, 185, 129, 0.2); color: #6EE7B7; border: 1px solid rgba(16, 185, 129, 0.3); margin-left: 6px;">⚡ 3대 분야 팩트 브리핑</span>';
    btnAnalyzeText = '<span>⚡</span> 팩트 데이터 & 4대 심층 분석 시작';
    badgeStatusText = '팩트 데이터 분석 대기';
  }

  selectedTopicBox.classList.add('has-content');
  selectedTopicBox.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
      <div style="font-weight: 800; font-size: 14px; color: var(--text-main); line-height: 1.3;">
        ${escapeHtml(selectedTopicData.topic)}
      </div>
      ${mediaBadgeHtml}
    </div>
    <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-bottom: 6px;">
      ${escapeHtml(selectedTopicData.summary)}
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding-top: 6px; border-top: 1px dashed var(--border-subtle);">
      <span style="color: var(--accent-orange); font-weight: 700;">출처: ${escapeHtml(selectedTopicData.source)}</span>
      ${selectedTopicData.url ? `<a href="${escapeHtml(selectedTopicData.url)}" target="_blank" class="origin-link">🔗 원본 보기 ↗</a>` : ''}
    </div>
  `;

  btnDeepAnalyze.style.display = 'block';
  btnDeepAnalyze.innerHTML = btnAnalyzeText;
  sttStatusBadge.innerText = badgeStatusText;
  sttStatusBadge.style.color = 'var(--accent-blue)';

  // Reset Sub-steps
  deepAnalysisBox.style.display = 'none';
  sectionAngles.style.display = 'none';
  sectionFeedback.style.display = 'none';
  sectionRender.style.display = 'none';
  resultZone.style.display = 'none';
}

// 2. Step 1: 멀티모달 딥분석 & 4대 심층 리포트 (원문/떡상요인/업그레이드/TOP3선발)
btnDeepAnalyze.addEventListener('click', async () => {
  if (!selectedTopicData || isGlobalBusy) return;
  isGlobalBusy = true;

  const isReel = selectedTopicData.mediaType === 'reel' || !!selectedTopicData.videoUrl;
  const isCardNews = selectedTopicData.mediaType === 'cardnews';

  btnDeepAnalyze.disabled = true;
  btnDeepAnalyze.innerHTML = isReel 
    ? '<span>⏳</span> Whisper STT 음성 전사 & 4대 심층 분석 중...'
    : isCardNews 
      ? '<span>⏳</span> Vision AI 슬라이드 해체 & 4대 심층 분석 중...'
      : '<span>⏳</span> 3대 분야 팩트 데이터 4대 심층 분석 중...';
      
  sttStatusBadge.innerText = '심층 딥분석 진행 중...';

  try {
    const res = await fetch('/api/analyze-multimodal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: selectedTopicData.topic,
        caption: selectedTopicData.caption,
        videoUrl: selectedTopicData.videoUrl,
        imageUrls: selectedTopicData.imageUrls,
        likesCount: selectedTopicData.likesCount,
        viewsCount: selectedTopicData.viewsCount
      })
    });
    const data = await res.json();
    multimodalAnalysisData = data;

    // Show Deep Analysis Result (4대 핵심 분석)
    deepAnalysisBox.style.display = 'block';
    
    const orig = data.originalContent || {};
    const viral = data.viralReason || {};
    const upg = data.upgradeStrategy || {};
    
    deepAnalysisSummary.innerHTML = `
      <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
        <div style="color: #60A5FA; font-weight: 800; margin-bottom: 2px;">1️⃣ 원문 상세 내용 분석:</div>
        <div style="color: var(--text-main); font-size: 12px; margin-bottom: 4px; line-height: 1.4;">${escapeHtml(orig.summary || selectedTopicData.caption)}</div>
        ${Array.isArray(orig.keyFacts) ? `<div style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">${orig.keyFacts.map(f => `• ${escapeHtml(f)}`).join('<br>')}</div>` : ''}
      </div>

      <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
        <div style="color: #F87171; font-weight: 800; margin-bottom: 2px;">2️⃣ 원문 떡상 요인 심층 해체:</div>
        <div style="color: #FCA5A5; font-size: 11px; font-weight: 700;">🎯 핵심 심리 트리거: ${escapeHtml(viral.trigger || '손실 회피 & 정보 비대칭')}</div>
        <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px; line-height: 1.4;">${escapeHtml(viral.analysis || '')}</div>
      </div>

      <div>
        <div style="color: #34D399; font-weight: 800; margin-bottom: 2px;">3️⃣ 차별화 업그레이드 접근법:</div>
        <div style="color: var(--text-muted); font-size: 11px; line-height: 1.4;"><span style="color: #FBBF24; font-weight: 700;">[원본 한계]</span> ${escapeHtml(upg.weakness || '단순 텍스트 나열로 가독성 및 소장 가치 부족')}</div>
        <div style="color: var(--text-main); font-size: 11px; margin-top: 2px; line-height: 1.4;"><span style="color: #34D399; font-weight: 700;">[차별화 전략]</span> ${escapeHtml(upg.approach || '정밀 인포그래픽과 3단계 실천 가이드로 저장률 극대화')}</div>
      </div>
    `;

    if (data.audioText) {
      sttTextPreview.style.display = 'block';
      sttTextPreview.innerHTML = `<strong>🎙️ 릴스 음성 전사 (Whisper STT):</strong><br><div style="white-space: pre-wrap;">${escapeHtml(data.audioText)}</div>`;
    } else if (data.imageText) {
      sttTextPreview.style.display = 'block';
      sttTextPreview.innerHTML = `<strong>👁️ 카드 슬라이드 추출 텍스트 (Vision AI):</strong><br><div style="white-space: pre-wrap; font-size: 11px; margin-top: 4px;">${escapeHtml(data.imageText)}</div>`;
    } else if (data.sttError || data.visionError) {
      sttTextPreview.style.display = 'block';
      sttTextPreview.innerHTML = `<div style="color: #FBBF24;">⚠️ ${escapeHtml(data.sttError || data.visionError)}</div>`;
    } else {
      sttTextPreview.style.display = 'none';
    }

    sttStatusBadge.innerText = '4대 심층 분석 완료';
    sttStatusBadge.style.color = 'var(--accent-green)';

    // Step 2: Render TOP 3 Selection with Detailed Storyline
    renderTop3Angles(data.top3Angles || [], data.selectionCriteria, data.remainingAngles || []);

    // Step 3 & 4 Visible
    sectionAngles.style.display = 'block';
    sectionFeedback.style.display = 'block';

  } catch (err) {
    console.error('딥분석 오류:', err);
    alert('딥분석 중 오류가 발생했습니다.');
  } finally {
    startCooldown(btnDeepAnalyze, isReel ? '<span>🎙️</span> 다시 딥분석하기' : '<span>⚡</span> 다시 딥분석하기', 3);
  }
});

// Render TOP 3 Angles Cards with Explicit Selection Reason, 1st Hook & Detailed Storyline
function renderTop3Angles(top3, criteria, remaining) {
  if (top3.length > 0) {
    const preferred = top3.find(a => a.id === savedAngleId);
    selectedAngleId = (preferred || top3[0]).id;
  }

  const top3Html = top3.map((a, idx) => {
    // 스토리라인 단계별 HTML 포맷팅
    const storylineSteps = (a.storyline || []).map(s => `
      <div class="storyline-step-item">
        <span class="storyline-step-badge">Slide ${escapeHtml(s.slide)} (${escapeHtml(s.role)})</span>
        <span class="storyline-step-detail">${escapeHtml(s.detail)}</span>
      </div>
    `).join('');

    return `
      <div class="angle-card ${a.id === selectedAngleId ? 'active' : ''}" data-angle="${escapeHtml(a.id)}" onclick="selectAngle('${escapeHtml(a.id)}')" style="border-left: 4px solid var(--accent-orange);">
        <div class="angle-card-top">
          <span class="angle-card-title">${escapeHtml(a.title)}</span>
          <span class="angle-card-tag" style="${idx === 0 ? 'background: #EF4444;' : 'background: var(--accent-blue);'}">${escapeHtml(a.tag)}</span>
        </div>
        
        <div style="font-size: 11px; color: #FBBF24; line-height: 1.4;">
          💡 <strong>선발 근거:</strong> ${escapeHtml(a.selectionReason)}
        </div>

        <div class="angle-card-hook">
          🎯 <strong>1장 킬러 카피:</strong> "${escapeHtml(a.customHook)}"
        </div>

        ${a.approach ? `<div style="font-size: 11px; color: #60A5FA; margin-top: 2px;">⚡ <strong>전개 전략:</strong> ${escapeHtml(a.approach)}</div>` : ''}

        <div style="font-size: 11px; font-weight: 700; color: var(--text-main); margin-top: 4px;">📋 카드별 상세 전개 시나리오:</div>
        <div class="angle-storyline-container">
          ${storylineSteps || `<div style="color: var(--text-muted); font-size: 11px;">${escapeHtml(a.plot || '단계별 전개 시나리오 준비 완료')}</div>`}
        </div>
      </div>
    `;
  }).join('');

  anglesGrid.innerHTML = `
    <div style="font-size: 12px; color: var(--text-main); margin-bottom: 10px; padding: 8px 12px; background: rgba(217, 83, 47, 0.1); border: 1px solid var(--border-subtle); border-radius: 6px;">
      🎯 <strong>7대 관점 중 엄선 기준:</strong> ${escapeHtml(criteria || '투자자의 손실 불안 해소 및 인스타그램 실전 저장/공유 잠재력 극대화')}
    </div>
    ${top3Html}
  `;
}

window.selectAngle = function(angleId) {
  selectedAngleId = angleId;
  savedAngleId = angleId;
  persistSettings({ selectedAngleId: angleId });
  document.querySelectorAll('.angle-card').forEach(c => {
    c.classList.toggle('active', c.getAttribute('data-angle') === angleId);
  });
};

// 3. Step 3: 사용자 피드백 & AI 슬라이드별 대본 생성
btnGenerateScript.addEventListener('click', async () => {
  if (!selectedTopicData || isGlobalBusy) return;
  isGlobalBusy = true;

  const originalHtml = '<span>✨</span> AI 슬라이드별 대본 생성 & 확정';
  btnGenerateScript.disabled = true;
  btnGenerateScript.innerHTML = '<span>⏳</span> AI 슬라이드별 대본 기획 중...';

  const slideCount = slideCountSelect.value;
  const userFeedback = userFeedbackInput.value.trim();
  const selectedAngleObj = (multimodalAnalysisData?.angles || []).find(a => a.id === selectedAngleId);

  try {
    const res = await fetch('/api/generate-advanced-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: selectedTopicData.topic,
        angleId: selectedAngleId,
        slideCount: slideCount,
        userFeedback: userFeedback,
        customHook: selectedAngleObj?.customHook || '',
        coreContext: {
          caption: selectedTopicData.caption,
          audioText: multimodalAnalysisData?.audioText,
          imageText: multimodalAnalysisData?.imageText
        }
      })
    });
    const data = await res.json();
    generatedCardScript = data.script;

    // Show Script Preview
    scriptPreviewBox.style.display = 'block';
    scriptSlidesBadge.innerText = `총 ${generatedCardScript.slides.length}장 구성`;
    
    scriptPreviewContent.innerHTML = generatedCardScript.slides.map(s => `
      <div class="script-slide-item">
        <strong>[${escapeHtml(s.slide_number)}/${escapeHtml(s.total_slides)}장 ${escapeHtml(String(s.type || '').toUpperCase())}]</strong>
        ${s.type === 'cover' ? ` ${escapeHtml(s.headline_prefix)} <span style="color: var(--accent-orange); font-weight: 800;">${escapeHtml(s.headline_highlight)}</span> ${escapeHtml(s.headline_suffix)}` : ''}
        ${s.type === 'body_list' || s.type === 'body_visual' ? ` <strong>${escapeHtml(s.title)}</strong><br><small style="color: var(--text-muted);">${(s.points || []).map(p => `• ${escapeHtml(p.heading)}: ${escapeHtml(p.desc)}`).join('<br>')}</small>` : ''}
        ${s.type === 'cta' ? ` <strong>${escapeHtml(s.summary_title)}</strong>: ${(s.summary_items || []).map(escapeHtml).join(' / ')}` : ''}
      </div>
    `).join('');

    // Step 4 Render Section Enable
    sectionRender.style.display = 'block';
    cardsGallery.style.display = 'none';
    cardsGallery.innerHTML = '';
    imagesPreview.style.display = 'none';
    imagesPreview.innerHTML = '';
    resultZone.style.display = 'none';
    savedFolderBadge.innerText = '';
    savedFilePath.innerHTML = '';

  } catch (err) {
    console.error('대본 생성 오류:', err);
    alert('대본 생성 중 오류가 발생했습니다.');
  } finally {
    startCooldown(btnGenerateScript, originalHtml, 3);
  }
});

// 4. Step 4: 자료수집 완료 및 종합 Markdown 리포트 파일 저장
async function requestSaveReport() {
  const selectedAngleObj = (multimodalAnalysisData?.allAngles || multimodalAnalysisData?.top3Angles || []).find(a => a.id === selectedAngleId);

  const saveRes = await fetch('/api/save-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topicData: selectedTopicData,
      multimodalData: multimodalAnalysisData,
      selectedAngle: selectedAngleObj,
      script: generatedCardScript
    })
  });
  const saveData = await saveRes.json();
  if (!saveData.success) throw new Error(saveData.error || '리포트 저장 실패');

  resultZone.style.display = 'flex';
  savedFolderBadge.innerText = saveData.folderName;
  savedFilePath.innerHTML = `
    <div><strong>📄 생성된 리포트:</strong> <code style="background: rgba(0,0,0,0.4); padding: 3px 8px; border-radius: 4px; color: #6EE7B7; font-weight: 700;">${escapeHtml(saveData.reportPath)}</code></div>
  `;
  reportMarkdownPreview.innerText = saveData.markdownSummary;
  return saveData;
}

btnSaveReport.addEventListener('click', async () => {
  if (!generatedCardScript || !selectedTopicData || isGlobalBusy) return;
  isGlobalBusy = true;

  const originalHtml = '<span>📁</span> 자료수집 완료 및 종합 리포트 저장';
  btnSaveReport.disabled = true;
  btnSaveReport.innerHTML = '<span>⏳</span> 리포트 및 대본 파일 생성 중...';

  try {
    const saveData = await requestSaveReport();
    alert(`🎉 [${saveData.folderName}] 자료수집 완료!\n'${saveData.reportPath}' 파일에 원본 정보, 음성 STT, 4대 심층 분석 및 대본이 완벽하게 저장되었습니다.`);
  } catch (err) {
    console.error('리포트 저장 오류:', err);
    alert(`저장 실패: ${err.message}`);
  } finally {
    startCooldown(btnSaveReport, originalHtml, 3);
  }
});

// 5. Step 5: AI 이미지 생성 & 1080x1350 카드뉴스 PNG 렌더링
async function ensureReportFolder() {
  let folder = savedFolderBadge.innerText.trim();
  if (!folder || resultZone.style.display === 'none') {
    const saveData = await requestSaveReport();
    folder = saveData.folderName;
  }
  return folder;
}

async function renderCardsToFolder(folder) {
  const renderRes = await fetch('/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: generatedCardScript, folderName: folder, theme: getCardTheme() })
  });
  const renderData = await renderRes.json();
  if (!renderData.success) throw new Error(renderData.error || '렌더링 실패');
  if (Array.isArray(renderData.warnings) && renderData.warnings.length > 0) {
    console.warn(`[렌더] 웹폰트 로드 실패: ${renderData.warnings.join(', ')} — 대체 폰트로 렌더링되었습니다.`);
  }

  cardsGallery.style.display = 'grid';
    cardsGallery.innerHTML = renderData.images.map((src, i) => `
      <a class="card-thumb" href="${escapeHtml(src)}" target="_blank">
        <img src="${escapeHtml(src)}" alt="카드뉴스 ${i + 1}장">
        <span>${String(i + 1).padStart(2, '0')}장 · 원본 열기 ↗</span>
      </a>
    `).join('');

  return renderData;
}

function fontWarningNote(renderData) {
  return Array.isArray(renderData?.warnings) && renderData.warnings.length
    ? `\n⚠️ 웹폰트 로드 실패: ${renderData.warnings.join(', ')} (대체 폰트로 렌더링됨)`
    : '';
}

// 5-1. AI 슬라이드 이미지 생성 → 카드에 반영
btnGenerateImages.addEventListener('click', async () => {
  if (!generatedCardScript || !selectedTopicData || isGlobalBusy) return;

  const visualCount = generatedCardScript.slides.filter(s => s.type === 'cover' || s.type === 'body_visual').length;
  if (visualCount === 0) {
    return alert('이미지가 들어가는 표지·비주얼 슬라이드가 없습니다.');
  }
  if (!confirm(`AI 이미지 ${visualCount}장을 생성합니다.\nOpenAI 크레딧이 사용됩니다. 계속할까요?`)) return;

  isGlobalBusy = true;
  const originalHtml = '<span>🖼️</span> AI 슬라이드 이미지 생성 (표지·비주얼)';
  btnGenerateImages.disabled = true;
  btnGenerateImages.innerHTML = '<span>⏳</span> 이미지 생성 중... (슬라이드당 10~30초)';

  try {
    const folder = await ensureReportFolder();

    const res = await fetch('/api/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: generatedCardScript, folderName: folder })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '이미지 생성 실패');
    if (!data.generated || data.generated.length === 0) throw new Error(data.message || '생성된 이미지가 없습니다.');

    generatedCardScript = data.script;

    imagesPreview.style.display = 'grid';
    imagesPreview.innerHTML = data.generated.map(g => `
      <a class="card-thumb" href="${escapeHtml(g.path)}" target="_blank">
        <img src="${escapeHtml(g.path)}" alt="슬라이드 ${escapeHtml(g.slide_number)} 이미지">
        <span>이미지 ${String(g.slide_number).padStart(2, '0')} · 카드 반영</span>
      </a>
    `).join('');

    const renderData = await renderCardsToFolder(folder);
    const errNote = data.errors?.length ? `\n(실패 ${data.errors.length}장: ${data.errors[0].error})` : '';
    alert(`🎉 이미지 ${data.generated.length}장 생성 → 카드 ${renderData.images.length}장에 반영 완료!${errNote}${fontWarningNote(renderData)}`);
  } catch (err) {
    console.error('이미지 생성 오류:', err);
    alert(`이미지 생성 실패: ${err.message}`);
  } finally {
    startCooldown(btnGenerateImages, originalHtml, 3);
  }
});

// 5-2. 카드뉴스 PNG 렌더링
btnRenderCards.addEventListener('click', async () => {
  if (!generatedCardScript || !selectedTopicData || isGlobalBusy) return;
  isGlobalBusy = true;

  const originalHtml = '<span>🎨</span> 카드뉴스 PNG 생성 (1080x1350)';
  btnRenderCards.disabled = true;
  btnRenderCards.innerHTML = '<span>⏳</span> 1080x1350 PNG 렌더링 중...';

  try {
    const folder = await ensureReportFolder();
    const renderData = await renderCardsToFolder(folder);
    alert(`🎉 카드뉴스 ${renderData.images.length}장 생성 완료!\noutputs/${renderData.folder}/cards/${fontWarningNote(renderData)}`);
  } catch (err) {
    console.error('카드 렌더링 오류:', err);
    alert(`카드 생성 실패: ${err.message}`);
  } finally {
    startCooldown(btnRenderCards, originalHtml, 3);
  }
});

// Event Listeners for Left Tabs
document.getElementById('btn-collect-topic').addEventListener('click', () => collectTopicTrends());
document.getElementById('btn-collect-accounts').addEventListener('click', collectAccountReels);
document.getElementById('btn-collect-estate').addEventListener('click', () => collectEstateData());
document.getElementById('btn-analyze-reels').addEventListener('click', analyzeReelsUrl);

// 2839 손실회피 퀵 프리셋 키워드 클릭 이벤트
document.querySelectorAll('.preset-tag-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const keyword = btn.getAttribute('data-keyword');
    const input = document.getElementById('topic-keyword-input');
    if (input && keyword) {
      input.value = keyword;
      collectTopicTrends();
    }
  });
});

// 네이버 실시간 뉴스 카테고리 필터 버튼 클릭 이벤트
document.querySelectorAll('.news-category-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.news-category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.getAttribute('data-cat');
    collectEstateData(cat);
  });
});



