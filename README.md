# ⚡ 2839 CardNews Studio (부동산 · 시사 · 재테크 손실회피 스튜디오)

> **2839 세대(28~39세 수도권 월급쟁이·가구주)의 자산(부동산·재테크)과 권리(시사·정책) '손실 회피(Loss Aversion)' 심리를 타깃팅하여, 인스타 핫트렌드와 실시간 뉴스를 멀티모달(Whisper STT / GPT-4o-mini Vision)로 분석하고 핀터레스트풍 1080x1350 카드뉴스를 자동 제작하는 AI 스튜디오**

---

## 🌟 핵심 특징 (Key Highlights)

1. **🎯 2839 자산·권리 손실회피 3대 분야 특화:**
   - **🏠 부동산:** 전세금 미반환, DSR 대출 한도 축소, 청약 부적격 탈락 등 자산 손실 방어.
   - **💰 재테크:** 숨은 돈 유출, 연말정산 세금 폭탄, 연금 고갈 대비 등 비용 손실 방어.
   - **🏛️ 시사·정책:** 세제·부동산·노동·연금 제도 변화를 '내 지갑 +/−'로 번역. 정파 논쟁·사건사고는 제외.
2. **🎬 멀티모달 AI 데이터 수집 & 4대 심층 역분석:**
   - **릴스 영상:** OpenAI Whisper-1 STT를 통해 영상 속 나레이션을 100% 텍스트로 전사.
   - **카드뉴스 이미지:** GPT-4o-mini Vision AI로 슬라이드 내 표, 수치 데이터, 텍스트 전수 추출.
   - **원문 떡상 요인 해체:** 사람들의 어떤 불안과 손실 심리를 자극하여 터졌는지 딥분석.
3. **🔥 오늘의 카드뉴스 소재 TOP 5 자동 선별:**
   - 실시간 뉴스에서 중복·사건사고·정파 기사를 걸러내고, 손실회피 적합도(`walletScore`) 45점 이상 소재만 추천 앵글과 함께 제시.
4. **📋 7대 떡상 관점 동적 선발 엔진:**
   - 2839 타깃의 손실 회피 반응성을 극대화할 **TOP 3 떡상 관점** 및 킬러 카피를 동적으로 추천.
5. **🚨 정보 누락 제로 (Zero Loss) 가변 슬라이드 (4~10장):**
   - 24대 도구, 10대 체크리스트 등 원본의 모든 항목을 임의 생략 없이 슬라이드를 동적으로 확장하여 100% 수록.
6. **🎨 핀터레스트 스타일 1080x1350 무손실 레티나 렌더링:**
   - **Pretendard 볼드 타이포그래피** (Hero 86px, Slide Title 82px) + 다크 옵시디언 글래스모피즘.
   - **Playwright `deviceScaleFactor: 2`** (2160x2700급 선명도) 캡처.

> 📌 타깃·앵글·콘텐츠 비중은 [STRATEGY.md](STRATEGY.md)에 정리되어 있습니다.

---

## 🏗️ 전체 시스템 구조 (Architecture)

```mermaid
graph TD
    A[인스타그램 / 네이버 뉴스] --> B[Apify & Cheerio 수집기]
    B --> C{미디어 유형 판별}
    C -->|릴스 비디오| D[OpenAI Whisper STT 전사]
    C -->|카드뉴스 이미지| E[GPT-4o-mini Vision AI OCR]
    C -->|기사 및 캡션| F[텍스트 메타데이터 파싱]
    D --> G[멀티모달 딥분석 엔진]
    E --> G
    F --> G
    G --> H[4대 심층 분석 & 7대 관점 TOP 3 추천]
    H --> I[AI 슬라이드 대본 생성 & report.md 저장]
    I --> J[/cardnews-creator 스킬]
    J --> K[OpenAI 이미지 생성 (표지·비주얼)]
    K --> L[Playwright 무손실 1080x1350 PNG 렌더링]
    L --> M[최종 카드뉴스 세트 완성]
```

---

## 🚀 빠른 시작 가이드 (Quick Start)

### 1. 필수 의존성 설치
```bash
npm install
npx playwright install chromium
```

### 1-1. 테스트 실행
```bash
npm test                 # 수집기·대본검증·LLM재시도·렌더러 단위 테스트
npm run smoke            # 실제 PNG 렌더 스모크 테스트 (API 키 불필요, Chromium 필요)
LIVE_TEST=1 npm test     # 네이버 실시간 수집까지 포함
```

### 1-2. 생성된 대본을 CLI로 다시 렌더링
```bash
npm run render -- 261029_1325     # outputs/261029_1325/script.json → cards/slide_XX.png
```
서버(`/api/render`)와 동일한 `engine/card_renderer.js`를 사용하므로 결과물이 같습니다.

### 1-3. outputs 보존 정책
```bash
npm run clean:outputs -- --days 7            # 7일 지난 폴더 미리보기 (기본 dry-run)
npm run clean:outputs -- --days 7 --apply    # 실제 삭제
```
`--keep 3` 을 주면 최근 3개 폴더는 나이와 무관하게 보존합니다.

### 2. 환경변수 설정 (`.env`)
프로젝트 루트 경로에 `.env` 파일을 생성하고 API 키를 입력합니다:
```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key_here
APIFY_TOKEN=your_apify_api_token_here
```

### 3. 대시보드 서버 실행
```bash
npm start
# 또는 node server.js
```
- 브라우저에서 `http://localhost:3000` 접속

---

## 🖥️ 대시보드 사용 방법 (Workflow)

```
[1. 좌측 탭에서 데이터 수집]
   ├─ 📊 1. 주제별 핫트렌드 (예: #청약, #코스피, #부동산 등 실시간 인기 릴스 20개)
   │     └─ 👑 BEST TOP 5에서 [전체선택] → [선택 N개 일괄생성] : 딥분석→대본→리포트→이미지→PNG까지 자동 실행
   ├─ 👥 2. 특정 계정 릴스 (관심 크리에이터 릴스 전수 수집)
   ├─ ⚡ 3. 실시간 핫이슈 (네이버 부동산/증시/정책 속보 수집)
   └─ 🔍 4. 릴스 URL 떡상 분석 (분석하고 싶은 인스타 릴스/게시물 URL 직접 입력)
                 ▼
[2. 우측 스튜디오 Step 1: 4대 심층 딥분석]
   • [음성 STT / 이미지 Vision & 4대 심층 분석 시작] 클릭
   • 1️⃣ 원문 상세 내용 / 2️⃣ 떡상 요인 / 3️⃣ 차별화 전략 / 4️⃣ 7대 관점 엄선
                 ▼
[3. Step 2 & 3: 관점 선택 및 슬라이드 대본 생성]
   • 추천된 TOP 3 관점 중 원하는 각도 선택 (또는 사용자 추가 지시사항 입력)
   • 슬라이드 장수(4~10장) 설정 후 [AI 슬라이드별 대본 생성 & 확정] 클릭
                 ▼
[4. Step 4: 종합 리포트 저장 & 카드뉴스 PNG 생성]
   • [자료수집 완료 및 종합 리포트 저장] 클릭 → `outputs/YYMMDD_HHMM/report.md` 저장
   • [AI 슬라이드 이미지 생성 (표지·비주얼)] 클릭 → `assets/slide_01.png` 생성 후 카드에 자동 반영 (OpenAI 크레딧 사용, 확인창 있음)
   • [카드뉴스 PNG 생성 (1080x1350)] 클릭 → `outputs/YYMMDD_HHMM/cards/slide_01.png ~`
   • 렌더 전 **🎨 카드 색상**에서 배경색·타이틀색·강조색을 지정 (프리셋 4종)
   • 선택한 관점·피드백·슬라이드 장수·색상은 `data/user_settings.json`에 저장되어 다음 실행 시 기본값으로 복원
   • 이미지가 없으면 타이포그래피 플레이스홀더로 렌더링됨 (리스트형 본문은 디자인상 사진 영역 없음)
```

---

## 🎨 `/cardnews-creator` 스킬로 카드뉴스 완성하기

대시보드에서 `report.md`가 생성되면, Antigravity 채팅창에서 슬래시 커맨드를 호출하여 즉시 최종 카드뉴스를 렌더링할 수 있습니다:

```text
/cardnews-creator @outputs/261002_1718/report.md
```

### 🛠️ 자동 실행 파이프라인:
1. **리포트 분석:** `report.md`를 읽어 슬라이드 장수, 관점, 본문 데이터 추출.
2. **맞춤 이미지 생성:** `generate_image` 도구로 각 슬라이드 맥락에 맞는 고화질 이미지(`assets/slide_01.jpg` ~) 자동 생성.
3. **템플릿 매칭 & 렌더링:** [DESIGN.md](DESIGN.md) 기반의 5대 레이아웃 매칭 및 Playwright로 1080x1350 레티나 PNG 출력.
4. **결과물 제공:** `outputs/YYMMDD_HHMM/cards/slide_01.png` ~ `slide_04.png` 및 대화창 내 캐러셀 미리보기 아티팩트 제공.

---

## 📊 7대 떡상 관점 매트릭스 (7 Viral Angles)

| 관점 ID | 관점 명칭 & 태그 | 핵심 심리 트리거 | 추천 최적 케이스 |
| :--- | :--- | :--- | :--- |
| `angle_warning` | 🚨 **1. 반전/폭로/경고형** (손실회피) | 손실 회피, 불안 | 규제 변경, 사기/함정, 세금 위험, 피해 예방 |
| `angle_cheat` | 📋 **2. 치트키/체크리스트형** (소장가치) | 효율 추구, 소장 욕구 | 필수 서류, 단계별 준비물, 툴 총정리 (저장 1위) |
| `angle_easy` | 💡 **3. 초등학생 3분 요약형** (대중성) | 이해 갈증, 쉬운 해설 | 복잡한 경제/금리 원리, HBM 반도체 기술, 어려운 법률 |
| `angle_vs` | ⚖️ **4. 극단적 VS 비교형** (댓글토론) | 호기심, 대립 토론 | 전세 vs 월세, 삼전 vs 하이닉스, 신축 vs 구축 (댓글 1위) |
| `angle_story` | 📈 **5. 실화 스토리텔링형** (공감/몰입) | 공감, 몰입, 성공 욕구 | 실제 인물 극복기, 영끌족 현실, 투자 성공담 |
| `angle_target` | 🎯 **6. 초개인화 타겟팅형** (클릭률) | 소속감, 맞춤 혜택 | 청년 전용 대출, 신혼특공, 프리랜서 절세 |
| `angle_calc` | 🔢 **7. 1분 계산기/수치 공식형** (스크랩) | 실질 이득, 직관성 | 대출 이자 절약 계산법, 연봉별 실수령액, 수익률 공식 |

---

## 📁 디렉토리 구조 (Folder Structure)

```text
15_card_new_1/
├── .agents/skills/cardnews-creator/  # Antigravity 카드뉴스 제작 스킬 (SKILL.md)
├── collectors/                       # 데이터 수집 모듈
│   ├── apify_collector.js            # Apify 인스타그램 크롤러 (태그/계정/단일URL)
│   └── estate_collector.js           # 네이버 실시간 뉴스 수집기
├── engine/                           # AI 기획 및 분석 엔진
│   ├── analyzer.js                   # 7대 관점 기반 고급 대본 생성기
│   └── multimodal_analyzer.js        # Whisper STT & GPT-4o-mini Vision 분석기 (engine/)
├── outputs/                          # 생성된 리포트 및 카드뉴스 저장 폴더
│   └── YYMMDD_HHMM/
│       ├── report.md                 # 기획 리포트 마크다운
│       ├── assets/                   # 슬라이드별 AI 생성 이미지
│       └── cards/                    # 1080x1350 최종 렌더링 PNG 파일
├── public/                           # 웹 대시보드 프론트엔드 (다크 글래스모피즘)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── scripts/                          # 렌더 CLI 및 단위 테스트
│   ├── render_cards.js               # outputs/<폴더>/script.json → PNG (서버와 동일 렌더러)
│   └── test_*.js                     # 수집기·검증·LLM·렌더러 테스트
├── templates/                        # 카드뉴스 HTML 템플릿
├── DESIGN.md                         # 핀터레스트 카드뉴스 디자인 시스템 명세서
├── DESIGN_DOC.md                     # 시스템 아키텍처 상세 설계서
├── STRATEGY.md                       # 타깃·앵글·콘텐츠 비중 전략 브리프
├── server.js                         # Express 백엔드 서버
└── package.json
```

---

## 📄 라이선스 (License)

본 프로젝트는 내부 연구 및 카드뉴스 제작 자동화를 위해 개발되었습니다.
