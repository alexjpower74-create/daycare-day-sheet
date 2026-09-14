// Newfoundland dates, labels and midnights, including both DST changes of 2026.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addDays, ageLabel, dateLabel, durationLabel, endOfDate, isValidDate, localDate, localHHMM, localInstant, longLabel,
  minutesBetween, startOfDate, timeLabel, weekdayKey,
} from '../src/time.js'

const iso = (d) => d.toISOString()

test('labels: date, long date, time', () => {
  assert.equal(dateLabel('2026-09-14'), 'Mon Sep 14')
  assert.equal(longLabel('2026-09-14'), 'Monday, September 14')
  assert.equal(dateLabel('2026-11-01'), 'Sun Nov 1')
  assert.equal(timeLabel('2026-09-14T10:35:00Z'), '8:05 AM')
  assert.equal(timeLabel('2026-09-14T14:30:00Z'), '12:00 PM')
  assert.equal(timeLabel('2026-09-14T02:30:00Z'), '12:00 AM')
  assert.equal(timeLabel('2026-09-14T19:00:00Z'), '4:30 PM')
  assert.equal(timeLabel('2026-09-15T02:29:59Z'), '11:59 PM')
  assert.equal(localHHMM('2026-09-14T11:30:00Z'), '09:00')
  assert.equal(weekdayKey('2026-09-14'), 'mon')
  assert.equal(weekdayKey('2026-09-20'), 'sun')
})

test('local date at 11:59 PM and 12:00 AM NDT', () => {
  assert.equal(localDate('2026-09-15T02:29:59.999Z'), '2026-09-14') // 11:59:59.999 PM NDT Sep 14
  assert.equal(localDate('2026-09-15T02:30:00.000Z'), '2026-09-15') // 12:00 AM NDT Sep 15
  assert.equal(localDate('2026-09-15T00:00:00.000Z'), '2026-09-14') // UTC midnight is 9:30 PM here
  assert.equal(iso(startOfDate('2026-09-15')), '2026-09-15T02:30:00.000Z')
  assert.equal(iso(endOfDate('2026-09-14')), '2026-09-15T02:30:00.000Z')
})

test('fall back, Nov 1 2026: Oct 31 ends at 12:00 AM NDT, Nov 1 is 25 hours and ends at 12:00 AM NST', () => {
  assert.equal(iso(endOfDate('2026-10-31')), '2026-11-01T02:30:00.000Z')
  assert.equal(iso(endOfDate('2026-11-01')), '2026-11-02T03:30:00.000Z')
  assert.equal((endOfDate('2026-11-01') - startOfDate('2026-11-01')) / 3600e3, 25)
  assert.equal(localDate('2026-11-02T03:29:59.999Z'), '2026-11-01')
  assert.equal(localDate('2026-11-02T03:30:00.000Z'), '2026-11-02')
  // The repeated hour: 1:00 AM NDT, then 1:00 AM NST an hour later.
  assert.equal(timeLabel('2026-11-01T03:30:00Z'), '1:00 AM')
  assert.equal(timeLabel('2026-11-01T04:30:00Z'), '1:00 AM')
  assert.equal(iso(localInstant('2026-11-01', 1, 0)), '2026-11-01T03:30:00.000Z', 'the earlier 1:00 AM wins')
  assert.equal(minutesBetween(localInstant('2026-10-31', 23, 0), localInstant('2026-11-01', 3, 0)), 300)
})

test('spring forward, Mar 8 2026: Mar 7 ends at 12:00 AM NST, Mar 8 is 23 hours and ends at 12:00 AM NDT', () => {
  assert.equal(iso(endOfDate('2026-03-07')), '2026-03-08T03:30:00.000Z')
  assert.equal(iso(endOfDate('2026-03-08')), '2026-03-09T02:30:00.000Z')
  assert.equal((endOfDate('2026-03-08') - startOfDate('2026-03-08')) / 3600e3, 23)
  assert.equal(localDate('2026-03-09T02:29:59.999Z'), '2026-03-08')
  assert.equal(localDate('2026-03-09T02:30:00.000Z'), '2026-03-09')
  assert.equal(localInstant('2026-03-08', 2, 30), null, '2:30 AM does not exist that night')
  assert.equal(timeLabel('2026-03-08T05:30:00Z'), '3:00 AM')
})

test('minutes truncate each instant, so the parts of a span add up to the whole', () => {
  assert.equal(minutesBetween('2026-09-14T10:35:59.999Z', '2026-09-14T10:36:00.000Z'), 1)
  assert.equal(minutesBetween('2026-09-14T10:35:00.000Z', '2026-09-14T10:35:59.999Z'), 0)
  assert.equal(minutesBetween('2026-09-14T10:35:30Z', '2026-09-14T12:00:29Z'), 85)
  let seed = 7
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  for (let i = 0; i < 500; i++) {
    const start = Date.parse('2026-09-14T20:00:00Z') + Math.floor(rand() * 6 * 3600e3)
    const end = start + Math.floor(rand() * 30 * 3600e3)
    const cut = endOfDate(localDate(start)).getTime()
    if (end <= cut) continue
    assert.equal(minutesBetween(start, cut) + minutesBetween(cut, end), minutesBetween(start, end))
  }
})

test('durations, ages, dates', () => {
  assert.equal(durationLabel(85), '1 h 25 min')
  assert.equal(durationLabel(45), '45 min')
  assert.equal(durationLabel(120), '2 h')
  assert.equal(durationLabel(0), '0 min')
  assert.equal(ageLabel('2025-03-14', '2026-09-14'), '1 year 6 months')
  assert.equal(ageLabel('2025-03-15', '2026-09-14'), '1 year 5 months')
  assert.equal(ageLabel('2026-01-01', '2026-09-14'), '8 months')
  assert.equal(ageLabel('2024-09-14', '2026-09-14'), '2 years')
  assert.equal(ageLabel('2025-08-14', '2026-09-14'), '1 year 1 month')
  assert.ok(isValidDate('2026-02-28'))
  assert.ok(!isValidDate('2026-02-30'))
  assert.ok(!isValidDate('2026-9-14'))
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})
