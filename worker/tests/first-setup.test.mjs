// tools/first-setup.mjs, pure parts and the CLI's refusals (no Worker needed).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hashPin } from '../src/auth.js'
import { checkSetup, firstSetupSql } from '../tools/first-setup.mjs'

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const INPUT = { centre: "O'Brien's Test Centre", phone: '(709) 555-0150', supervisor: 'Pat Q. Test', pin: '5827' }

test('first-setup SQL: the real centre with sample 0, the six cited rules, one supervisor whose PIN hash verifies', async () => {
  const sql = await firstSetupSql(INPUT)
  assert.match(sql, /INSERT INTO centre \(id, name, sample, phone\) VALUES \(1, 'O''Brien''s Test Centre', 0, '709-555-0150'\);/)
  assert.equal((sql.match(/INSERT INTO ratio_rules/g) || []).length, 6)
  for (const [group, per, max] of [['infant', 3, 6], ['toddler', 5, 10], ['preschool', 8, 16], ['prek', 10, 20], ['school_age', 15, 30],
    ['toddler_preschool', 7, 14]]) {
    assert.match(sql, new RegExp(`VALUES \\('${group}', '[^']+', ${per}, ${max}, ${per}, ${max},`))
  }
  const staff = sql.match(/INSERT INTO staff .* VALUES \('(s_[0-9a-f]{16})', 'Pat Q\. Test', 'PQ', 'supervisor', 1, '([0-9a-f]{64})', '([0-9a-f]{32})'\);/)
  assert.ok(staff, sql)
  assert.equal(await hashPin('5827', staff[3]), staff[2], 'PBKDF2 as src/auth.js makes it')
  assert.notEqual(await hashPin('5828', staff[3]), staff[2])
  assert.doesNotMatch(sql, /SAMPLE|5827/, 'no SAMPLE rows and never the PIN itself')
  const again = await firstSetupSql(INPUT)
  assert.notEqual(again.match(/'([0-9a-f]{32})'\);/)[1], staff[3], 'a new salt every run')
})

test('first-setup refuses a bad PIN, phone or name', () => {
  for (const [over, re] of [[{ pin: '12' }, /--pin/], [{ pin: '1234567' }, /--pin/], [{ pin: 1234 }, /--pin/], [{ phone: '555-0150' }, /--phone/],
    [{ centre: '' }, /--centre/], [{ centre: 'x'.repeat(81) }, /--centre/], [{ supervisor: 'Two\nlines' }, /--supervisor/]]) {
    assert.throws(() => checkSetup({ ...INPUT, ...over }), re, JSON.stringify(over))
  }
})

test('first-setup CLI writes the file, and exits non-zero on bad input without writing', () => {
  const dir = mkdtempSync(path.join(WORKER, '.state-setup-tool-'))
  try {
    const out = path.join(dir, 'first-setup.sql')
    const ok = spawnSync(process.execPath, ['tools/first-setup.mjs', '--centre', 'Tool Check Centre', '--phone', '7095550150',
      '--supervisor', 'Tool Check', '--pin', '4321', '--out', out], { cwd: WORKER, encoding: 'utf8' })
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(readFileSync(out, 'utf8'), /'Tool Check Centre', 0, '709-555-0150'/)
    const bad = spawnSync(process.execPath, ['tools/first-setup.mjs', '--centre', 'X', '--phone', '7095550150', '--supervisor', 'Y',
      '--pin', '12', '--out', path.join(dir, 'bad.sql')], { cwd: WORKER, encoding: 'utf8' })
    assert.equal(bad.status, 2)
    assert.match(bad.stderr, /--pin/)
    assert.throws(() => readFileSync(path.join(dir, 'bad.sql')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
