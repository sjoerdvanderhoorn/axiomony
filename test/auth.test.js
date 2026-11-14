import test from 'node:test';
import assert from 'node:assert/strict';
import { readBasicAuth, allowedOrigin } from '../src/auth.js';

test('Basic extracts username and password without including password in tools', () => {
  const value = 'Basic ' + Buffer.from('demo_maker:secret:with:colons').toString('base64');
  assert.deepEqual(readBasicAuth(value), { username: 'demo_maker', password: 'secret:with:colons' });
  assert.equal(readBasicAuth('Bearer abc'), null);
  assert.equal(readBasicAuth('Basic !!!!'), null);
});

test('Host and Origin are validated', () => {
  const hosts = ['localhost', 'example.org'];
  assert.equal(allowedOrigin('localhost:3000', '', hosts), true);
  assert.equal(allowedOrigin('example.org', 'https://example.org', hosts), true);
  assert.equal(allowedOrigin('evil.example', '', hosts), false);
  assert.equal(allowedOrigin('localhost', 'https://evil.example', hosts), false);
});
