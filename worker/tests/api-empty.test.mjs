// Runs first on the fresh Worker tests/run.mjs starts (migrated D1, no reset, no first setup yet).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { call } from './api-helpers.mjs'

test('info before the centre row exists: centre_name "", phone "", sample false; a reset then makes it the SAMPLE centre', async () => {
  const r = await call('GET', '/api/info')
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.deepEqual([r.body.centre_name, r.body.phone, r.body.sample], ['', '', false], 'no centre yet: no name, no phone, no SAMPLE badge')
  assert.equal((await call('POST', '/api/test/reset')).status, 200)
  const after = await call('GET', '/api/info')
  assert.deepEqual([after.body.centre_name, after.body.sample], ['SAMPLE Little Harbour Child Care (demo)', true])
})
