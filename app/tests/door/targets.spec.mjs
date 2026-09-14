// Door tablet targets (dd1): every button and key at least 72 px that hit-tests to itself (elementFromPoint), the pad at least
// 600×200, SAMPLE on every screen, no sideways scroll, #action-in contrast, and the sheet at 768×1024 portrait. Both engines.
import { expect, test } from '@playwright/test'
import { assertNoThirdParty, contrastOf, drawSignature, expectTapTarget, fresh, keypad, SUPERVISOR_PIN, tap } from '../helpers.mjs'

const DOOR_MIN = 72

test.afterEach(async ({ context }) => assertNoThirdParty(context))

async function everyButton(page, scope, label) {
  const buttons = await page.locator(`${scope} button:visible`).all()
  expect(buttons.length, `${label}: buttons on screen`).toBeGreaterThan(0)
  for (const [i, b] of buttons.entries()) {
    const text = ((await b.textContent()) || '').trim().replace(/\s+/g, ' ').slice(0, 30)
    await expectTapTarget(page, b, DOOR_MIN, `${label} button ${i + 1} "${text}"`)
  }
}

async function screenChecks(page, label) {
  await expect(page.locator('.sample-badge:visible').first(), `${label}: SAMPLE is visible`).toBeVisible()
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sideways, `${label}: no horizontal scroll`).toBeLessThanOrEqual(0)
}

async function setUp(page) {
  await page.goto('/door/')
  await expect(page.getByRole('heading', { name: 'Set up this tablet' })).toBeVisible()
  await screenChecks(page, 'setup')
  await everyButton(page, 'body', 'setup keypad')
  await keypad(page, SUPERVISOR_PIN, page.locator('#pin-enter'))
  await expect(page.locator('button.child[data-child="c_ava"]')).toBeVisible()
}

test('targets at 1024×768: the keypad, the grid and chips, every sheet step, the block, the pad and the confirmation', async ({ page, context, request }) => {
  await fresh(context, request)
  await setUp(page)
  await screenChecks(page, 'grid')
  await everyButton(page, 'body', 'grid')
  await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
  await expect(page.locator('#action-in')).toBeVisible()
  await screenChecks(page, 'sheet action')
  await everyButton(page, '#sheet', 'sheet action')
  await tap(page, page.locator('#action-in'), 'Sign in')
  await expect(page.getByText('Who is dropping off?')).toBeVisible()
  await everyButton(page, '#sheet', 'who is dropping off')
  await tap(page, page.locator('#someone-else'), 'Someone else')
  await expect(page.locator('#not-on-list')).toBeVisible()
  await screenChecks(page, 'block')
  await everyButton(page, '#sheet', 'block')
  await tap(page, page.locator('#back'), 'Back')
  await tap(page, page.locator('button.person[data-person="p_ava_mother"]'), 'Sarah')
  await expect(page.locator('#pad')).toBeVisible()
  const pad = await page.locator('#pad').boundingBox()
  expect(pad.width, 'pad width').toBeGreaterThanOrEqual(600)
  expect(pad.height, 'pad height').toBeGreaterThanOrEqual(200)
  await drawSignature(page, page.locator('#pad'))
  await expect(page.locator('#pad-done')).toBeEnabled()
  await screenChecks(page, 'pad')
  await everyButton(page, '#sheet', 'pad')
  await tap(page, page.locator('#pad-done'), 'Done')
  await expect(page.locator('#confirm')).toBeVisible()
  await screenChecks(page, 'confirmation')
  await everyButton(page, '#sheet', 'confirmation')
})

test('#action-in text has at least 4.5:1 contrast on its own background', async ({ page, context, request }) => {
  await fresh(context, request)
  await setUp(page)
  await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
  expect(await contrastOf(page.locator('#action-in'))).toBeGreaterThanOrEqual(4.5)
})

test('portrait 768×1024: the grid and every sheet step still fit, with no sideways scroll and every button hit-testing', async ({ page, context, request }) => {
  await fresh(context, request)
  await page.setViewportSize({ width: 768, height: 1024 })
  await setUp(page)
  await screenChecks(page, 'portrait grid')
  await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
  await expect(page.locator('#action-in')).toBeVisible()
  await everyButton(page, '#sheet', 'portrait action')
  await tap(page, page.locator('#action-in'), 'Sign in')
  await expect(page.getByText('Who is dropping off?')).toBeVisible()
  await screenChecks(page, 'portrait who')
  await everyButton(page, '#sheet', 'portrait who')
  await tap(page, page.locator('button.person[data-person="p_ava_mother"]'), 'Sarah')
  await expect(page.locator('#pad')).toBeVisible()
  const pad = await page.locator('#pad').boundingBox()
  expect(pad.x, 'pad starts on screen').toBeGreaterThanOrEqual(0)
  expect(pad.x + pad.width, 'pad ends on screen').toBeLessThanOrEqual(768)
  expect(pad.width, 'pad is still at least 600 wide in portrait').toBeGreaterThanOrEqual(600)
  await drawSignature(page, page.locator('#pad'))
  await expect(page.locator('#pad-done')).toBeEnabled()
  await screenChecks(page, 'portrait pad')
  await everyButton(page, '#sheet', 'portrait pad')
  await tap(page, page.locator('#pad-done'), 'Done')
  await expect(page.locator('#confirm')).toContainText('Signed in')
  await screenChecks(page, 'portrait confirmation')
  await everyButton(page, '#sheet', 'portrait confirmation')
})
