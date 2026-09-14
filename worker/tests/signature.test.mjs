// Signature validation and the SVG built from its integers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSignature, signatureSvg } from '../src/signature.js'

const sig = (strokes, over = {}) => ({ w: 600, h: 200, strokes, ...over })
const GOOD = [[40, 150, 120, 60, 200, 140, 280, 50, 360, 150]]

test('a real scribble is accepted and copied', () => {
  const s = parseSignature(sig(GOOD))
  assert.deepEqual(s, { w: 600, h: 200, strokes: GOOD })
  assert.notEqual(s.strokes[0], GOOD[0], 'a copy, not the caller\'s array')
  assert.ok(parseSignature(sig([[0, 0, 600, 200]])), 'the corners of the box are inside')
  assert.ok(parseSignature(sig([[10, 10, 30, 10]])), 'exactly 20 units across is enough')
  assert.ok(parseSignature(sig([[10, 10, 10, 30]])), 'exactly 20 units down is enough')
  assert.ok(parseSignature(sig([[10, 10, 20, 10], [25, 10, 30, 10]])), 'the span counts across strokes')
})

test('refused: empty, one point, a dot, out of the box, non-integers, odd length, wrong box', () => {
  const refused = {
    'no body': undefined,
    'null': null,
    'an array': [],
    'no strokes': sig([]),
    'strokes not an array': sig('M0 0'),
    'a stroke that is not an array': sig(['40,150,120,60']),
    'one point': sig([[40, 150]]),
    'a dot under 20 units': sig([[100, 100, 119, 119, 105, 110]]),
    'x past the right edge': sig([[40, 150, 601, 60]]),
    'y below the box': sig([[40, 150, 120, 201]]),
    'a negative number': sig([[-1, 150, 120, 60]]),
    'a fraction': sig([[40.5, 150, 120, 60]]),
    'a number as a string': sig([['40', 150, 120, 60]]),
    'NaN': sig([[NaN, 150, 120, 60]]),
    'odd length': sig([[40, 150, 120, 60, 200]]),
    'wrong width': sig(GOOD, { w: 800 }),
    'wrong height': sig(GOOD, { h: 300 }),
  }
  for (const [why, value] of Object.entries(refused)) assert.equal(parseSignature(value), null, why)
})

test('limits: 50 strokes and 4 000 points are fine, one more of either is refused', () => {
  const stroke = [10, 10, 100, 100]
  assert.ok(parseSignature(sig(Array.from({ length: 50 }, () => stroke))))
  assert.equal(parseSignature(sig(Array.from({ length: 51 }, () => stroke))), null)
  const long = (points) => Array.from({ length: points * 2 }, (_, i) => (i % 2 ? i % 200 : i % 600))
  assert.ok(parseSignature(sig([long(4000)])))
  assert.equal(parseSignature(sig([long(4001)])), null)
  assert.equal(parseSignature(sig([long(2000), long(2001)])), null, 'the 4 000 points are counted across strokes')
})

test('the SVG is built from integers only: the path holds nothing but M, L, digits and spaces', () => {
  const svg = signatureSvg([[40, 150, 120, 60, 200, 140], [300, 20, 310, 180]])
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><path d="M40 150 L120 60 L200 140 M300 20 L310 180"/></svg>')
  const d = svg.match(/ d="([^"]*)"/)[1]
  assert.match(d, /^[ML0-9 ]+$/)
  // Even if something odd got past validation, only digits reach the markup.
  const odd = signatureSvg([['"/><script>', 1, 2, 3]])
  assert.doesNotMatch(odd, /script/)
  assert.match(odd.match(/ d="([^"]*)"/)[1], /^[ML0-9 ]+$/)
})
