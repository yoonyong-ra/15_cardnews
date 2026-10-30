/**
 * OpenAI Chat Completions 공통 호출 래퍼
 *
 * - 모든 호출에 타임아웃을 건다. (기본 60초, SDK 기본값은 무제한에 가깝다)
 * - 네트워크 오류/타임아웃/429/5xx만 지수 백오프로 재시도한다.
 * - 400/401/403/422 같은 요청·인증 오류는 즉시 실패시킨다. (재시도해도 결과가 같음)
 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err) return false;

  const status = err.status ?? err.response?.status;
  if (typeof status === 'number') {
    if (status === 408 || status === 409 || status === 429) return true;
    return status >= 500;
  }

  const name = String(err.name || '');
  const message = String(err.message || '');
  if (/timeout/i.test(name) || /timeout/i.test(message)) return true;
  if (err.name === 'AbortError') return true;

  const code = err.code || err.cause?.code;
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE']
    .includes(code);
}

/**
 * @param {import('openai').OpenAI} openai
 * @param {object} body chat.completions.create 페이로드
 * @param {{ timeout?: number, retries?: number, label?: string, retryDelayMs?: number }} options
 */
async function callChatCompletion(openai, body, options = {}) {
  const {
    timeout = 60000,
    retries = 2,
    label = 'LLM',
    retryDelayMs = 800
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await openai.chat.completions.create(body, { timeout });
    } catch (err) {
      lastError = err;
      if (attempt === retries || !isRetryableError(err)) break;

      const delay = retryDelayMs * Math.pow(2, attempt);
      console.warn(`[${label}] 호출 실패(${err.status || err.code || err.name}) → ${delay}ms 후 재시도 (${attempt + 1}/${retries})`);
      await sleep(delay);
    }
  }

  throw lastError;
}

module.exports = { callChatCompletion, isRetryableError, sleep };
