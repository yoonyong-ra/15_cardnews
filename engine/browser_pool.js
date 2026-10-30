/**
 * Playwright Chromium 싱글톤 풀
 *
 * 요청마다 chromium.launch()를 호출하면 1~2초 오버헤드와 메모리 급증이 발생한다.
 * 여기서는 브라우저 1개를 재사용하고, 요청마다 컨텍스트만 열고 닫는다.
 * 유휴(idle) 상태가 BROWSER_IDLE_MS 이상이면 브라우저를 종료해 프로세스를 남기지 않는다.
 */

const { chromium } = require('playwright');

const IDLE_CLOSE_MS = Number(process.env.BROWSER_IDLE_MS || 60000);

let browserPromise = null;
let activeContexts = 0;
let idleTimer = null;

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (activeContexts > 0) return;
    const pending = browserPromise;
    browserPromise = null;
    console.log(`[브라우저] ${IDLE_CLOSE_MS}ms 유휴 → Chromium 종료`);
    Promise.resolve(pending)
      .then(browser => browser && browser.close())
      .catch(() => {});
  }, IDLE_CLOSE_MS);
  if (typeof idleTimer.unref === 'function') idleTimer.unref();
}

async function getBrowser() {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing && existing.isConnected()) return existing;
    browserPromise = null;
  }

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true })
      .then(browser => {
        console.log('[브라우저] Chromium 시작 (이후 요청은 재사용)');
        browser.on('disconnected', () => {
          if (browserPromise) browserPromise = null;
        });
        return browser;
      })
      .catch(err => {
        browserPromise = null;
        throw err;
      });
  }

  return browserPromise;
}

/**
 * 브라우저를 재사용해 페이지 하나를 열고 작업을 수행한 뒤 컨텍스트를 닫는다.
 * @param {import('playwright').BrowserContextOptions} contextOptions
 * @param {(page: import('playwright').Page) => Promise<any>} handler
 */
async function withPage(contextOptions, handler) {
  const browser = await getBrowser();
  const context = await browser.newContext(contextOptions || {});
  activeContexts += 1;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  try {
    const page = await context.newPage();
    return await handler(page);
  } finally {
    activeContexts = Math.max(0, activeContexts - 1);
    await context.close().catch(() => {});
    if (activeContexts === 0) scheduleIdleClose();
  }
}

async function closeBrowser() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch (err) {
    /* 이미 종료된 경우 무시 */
  }
}

module.exports = { getBrowser, withPage, closeBrowser, IDLE_CLOSE_MS };
