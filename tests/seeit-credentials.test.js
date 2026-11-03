import test from 'node:test';
import assert from 'node:assert/strict';
import { post } from '../../dsh-seeit-video/src/providers.js';

test('literal ASR keys in reference fields are rejected without echoing the value', async () => {
  const secret = 'sk-synthetic-never-real';
  const runtime = { resolveCredential: () => assert.fail('invalid ref must not reach resolver'), fetcher: () => assert.fail('invalid ref must not reach network'), config: {} };
  await assert.rejects(() => post(runtime, { apiKeyRef: secret }, 'audio/transcriptions', {}), error => !error.message.includes(secret) && /凭据引用/.test(error.message));
});
