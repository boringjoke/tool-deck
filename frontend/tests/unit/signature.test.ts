import { describe, expect, it } from 'vitest'

import {
  SIGNATURE_CANVAS_HEIGHT,
  SIGNATURE_CANVAS_WIDTH,
  appendSignatureStrokePoint,
  beginSignatureStroke,
  clearSignatureStrokes,
  commitSignatureStroke,
  hasSignatureContent,
  normalizeSignaturePoint,
  undoSignatureStroke,
} from '../../core/signature'

describe('signature core', () => {
  it('normalizes points to the fixed canvas boundary', () => {
    expect(normalizeSignaturePoint({ x: -10, y: SIGNATURE_CANVAS_HEIGHT + 10 })).toEqual({
      ok: true,
      value: { x: 0, y: SIGNATURE_CANVAS_HEIGHT },
    })
    expect(normalizeSignaturePoint({ x: SIGNATURE_CANVAS_WIDTH, y: 0 })).toEqual({
      ok: true,
      value: { x: SIGNATURE_CANVAS_WIDTH, y: 0 },
    })
  })

  it('creates and appends a stroke without mutating the original', () => {
    const started = beginSignatureStroke({ x: 40, y: 50 })
    expect(started).toMatchObject({ ok: true, value: { points: [{ x: 40, y: 50 }] } })
    if (!started.ok) return

    const appended = appendSignatureStrokePoint(started.value, { x: 80, y: 90 })
    expect(appended).toMatchObject({
      ok: true,
      value: { points: [{ x: 40, y: 50 }, { x: 80, y: 90 }] },
    })
    expect(started.value.points).toEqual([{ x: 40, y: 50 }])
  })

  it('commits multiple strokes and undoes one stroke at a time', () => {
    const first = beginSignatureStroke({ x: 10, y: 10 })
    const second = beginSignatureStroke({ x: 100, y: 100 })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const oneStroke = commitSignatureStroke([], first.value)
    expect(oneStroke.ok).toBe(true)
    if (!oneStroke.ok) return

    const twoStrokes = commitSignatureStroke(oneStroke.value, second.value)
    expect(twoStrokes).toMatchObject({ ok: true, value: { length: 2 } })
    if (!twoStrokes.ok) return

    expect(undoSignatureStroke(twoStrokes.value)).toEqual([first.value])
    expect(undoSignatureStroke(undoSignatureStroke(twoStrokes.value))).toEqual([])
  })

  it('treats a single point as content and clears to idle', () => {
    const started = beginSignatureStroke({ x: 20, y: 30 })
    expect(started.ok).toBe(true)
    if (!started.ok) return

    const committed = commitSignatureStroke([], started.value)
    expect(committed.ok).toBe(true)
    if (!committed.ok) return

    expect(hasSignatureContent(committed.value)).toBe(true)
    expect(clearSignatureStrokes()).toEqual([])
    expect(hasSignatureContent([])).toBe(false)
  })

  it('rejects invalid coordinates and invalid stroke state', () => {
    expect(normalizeSignaturePoint({ x: Number.NaN, y: 0 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(beginSignatureStroke({ x: Number.POSITIVE_INFINITY, y: 0 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(appendSignatureStrokePoint({ points: [] }, { x: 0, y: 0 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-state' },
    })
    expect(commitSignatureStroke([], { points: [] })).toMatchObject({
      ok: false,
      error: { code: 'invalid-state' },
    })
  })
})
