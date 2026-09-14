// The first-setup check (tests/run.mjs runs it): migrations + tools/first-setup.mjs SQL on a fresh local D1, and the Worker
// started WITHOUT TEST_MODE, as a real centre would be.
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { SETUP_BASE: BASE, SETUP_CENTRE, SETUP_PHONE, SETUP_SUPERVISOR, SETUP_PIN } = process.env

async function call(method, url, { body, token, headers = {} } = {}) {
  const h = { ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  if (body !== undefined) h['Content-Type'] = 'application/json'
  const r = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}

test('first setup: the supervisor PIN signs in, info shows the real centre with sample false, and the test routes are 404', async () => {
  assert.ok(BASE && SETUP_PIN, 'run through tests/run.mjs')
  const info = await call('GET', '/api/info', { headers: { 'X-Test-Now': '2030-01-01T12:00:00Z' } })
  assert.equal(info.status, 200)
  assert.deepEqual([info.body.centre_name, info.body.sample, info.body.phone], [SETUP_CENTRE, false, SETUP_PHONE])
  assert.notEqual(info.body.now, '2030-01-01T12:00:00.000Z', 'X-Test-Now is ignored without TEST_MODE')
  const signin = await call('POST', '/api/signin', { body: { pin: SETUP_PIN } })
  assert.equal(signin.status, 200, JSON.stringify(signin.body))
  assert.equal(signin.body.role, 'supervisor')
  assert.equal(signin.body.staff.name, SETUP_SUPERVISOR)
  assert.equal((await call('POST', '/api/signin', { body: { pin: '4826' } })).status, 401, 'no SAMPLE PIN exists')
  const ratios = await call('GET', '/api/office/ratios', { token: signin.body.token })
  assert.deepEqual(ratios.body.rules.map((r) => [r.age_group, r.children_per_caregiver, r.max_children, r.edited]), [
    ['infant', 3, 6, false], ['toddler', 5, 10, false], ['preschool', 8, 16, false], ['prek', 10, 20, false],
    ['school_age', 15, 30, false], ['toddler_preschool', 7, 14, false]])
  assert.deepEqual((await call('GET', '/api/office/children', { token: signin.body.token })).body.children, [])
  assert.deepEqual((await call('GET', '/api/office/rooms', { token: signin.body.token })).body.rooms, [])
  assert.equal((await call('POST', '/api/test/reset')).status, 404)
  assert.equal((await call('POST', '/api/test/seed', { body: { scenario: 'demo' } })).status, 404)
})
