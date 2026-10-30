/**
 * STT 용량 가드 테스트 (외부 API 호출 없음)
 *
 * 로컬 HTTP 서버로 26MB 가짜 영상을 내려주고, Whisper 25MB 한도를 넘으면
 * 다운로드를 중단하고 too_large 사유를 돌려주는지 확인한다.
 */

const assert = require('assert');
const http = require('http');

process.env.OPENAI_API_KEY = 'sk-test-key-for-stt-guard';

const { transcribeReelsAudio } = require('../engine/multimodal_analyzer');

const PAYLOAD_SIZE = 26 * 1024 * 1024;
const payload = Buffer.alloc(PAYLOAD_SIZE, 0x61);

let passed = 0;

function check(name, fn) {
  passed += 1;
  console.log(`✅ ${name}`);
  return fn();
}

function startServer({ withContentLength }) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (withContentLength) {
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(payload.length) });
      } else {
        res.writeHead(200, { 'Content-Type': 'video/mp4' }); // chunked
      }
      res.end(payload);
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

(async () => {
  await check('Content-Length 초과 → 즉시 too_large', async () => {
    const { server, port } = await startServer({ withContentLength: true });
    try {
      const result = await transcribeReelsAudio(`http://127.0.0.1:${port}/big.mp4`);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.reason, 'too_large');
      assert.ok(result.message.includes('25MB'), result.message);
    } finally {
      server.close();
    }
  });

  await check('청크 전송(헤더 없음) → 25MB 초과 시 중단', async () => {
    const { server, port } = await startServer({ withContentLength: false });
    try {
      const result = await transcribeReelsAudio(`http://127.0.0.1:${port}/big-chunked.mp4`);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.reason, 'too_large');
      assert.ok(result.message.includes('25MB'), result.message);
    } finally {
      server.close();
    }
  });

  await check('URL 없음 → no_url', async () => {
    const result = await transcribeReelsAudio('');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'no_url');
  });

  await check('연결 실패 → error 사유로 반환 (throw 없음)', async () => {
    const result = await transcribeReelsAudio('http://127.0.0.1:1/nope.mp4');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'error');
    assert.ok(result.message.startsWith('음성 전사 실패'), result.message);
  });

  console.log(`\n${passed}개 STT 가드 테스트 통과`);
})().catch(err => {
  console.error('❌ 테스트 실패:', err.message);
  process.exit(1);
});
