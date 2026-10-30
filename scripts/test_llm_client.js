const assert = require('assert');
const { callChatCompletion, isRetryableError } = require('../engine/llm_client');

let passed = 0;

function check(name, fn) {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`✅ ${name}`);
  });
}

function makeClient(failures = []) {
  const state = { calls: 0, options: null };
  const client = {
    state,
    chat: {
      completions: {
        create: async (body, options) => {
          state.calls += 1;
          state.options = options;
          const next = failures.shift();
          if (next) throw next;
          return { choices: [{ message: { content: '{"ok":true}' } }] };
        }
      }
    }
  };
  return client;
}

function apiError(status, message = 'api error') {
  const err = new Error(message);
  err.status = status;
  return err;
}

(async () => {
  await check('5xx는 재시도 후 성공', async () => {
    const client = makeClient([apiError(500), apiError(502)]);
    const result = await callChatCompletion(client, { model: 'x' }, { retries: 2, retryDelayMs: 1, timeout: 1234 });
    assert.strictEqual(client.state.calls, 3);
    assert.strictEqual(client.state.options.timeout, 1234);
    assert.strictEqual(result.choices[0].message.content, '{"ok":true}');
  });

  await check('401은 재시도하지 않음', async () => {
    const client = makeClient([apiError(401, 'bad key')]);
    await assert.rejects(
      () => callChatCompletion(client, { model: 'x' }, { retries: 2, retryDelayMs: 1 }),
      /bad key/
    );
    assert.strictEqual(client.state.calls, 1);
  });

  await check('타임아웃 오류는 재시도', async () => {
    const timeoutErr = new Error('Request timed out.');
    timeoutErr.name = 'APIConnectionTimeoutError';
    const client = makeClient([timeoutErr]);
    const result = await callChatCompletion(client, { model: 'x' }, { retries: 2, retryDelayMs: 1 });
    assert.strictEqual(client.state.calls, 2);
    assert.ok(result.choices[0].message.content);
  });

  await check('429는 재시도', async () => {
    const client = makeClient([apiError(429, 'rate limited')]);
    await callChatCompletion(client, { model: 'x' }, { retries: 2, retryDelayMs: 1 });
    assert.strictEqual(client.state.calls, 2);
  });

  await check('재시도 소진 시 마지막 오류를 던짐', async () => {
    const client = makeClient([apiError(500), apiError(503), apiError(504)]);
    await assert.rejects(
      () => callChatCompletion(client, { model: 'x' }, { retries: 1, retryDelayMs: 1 }),
      /api error/
    );
    assert.strictEqual(client.state.calls, 2);
  });

  await check('재시도 가능 여부 분류', () => {
    assert.strictEqual(isRetryableError(apiError(429)), true);
    assert.strictEqual(isRetryableError(apiError(500)), true);
    assert.strictEqual(isRetryableError(apiError(400)), false);
    assert.strictEqual(isRetryableError(apiError(401)), false);
    const netErr = new Error('socket hang up');
    netErr.code = 'ECONNRESET';
    assert.strictEqual(isRetryableError(netErr), true);
    assert.strictEqual(isRetryableError(new Error('boom')), false);
  });

  console.log(`\n${passed}개 LLM 클라이언트 테스트 통과`);
})().catch(err => {
  console.error('❌ 테스트 실패:', err.message);
  process.exit(1);
});
