import { describe, expect, it } from 'vitest'
import { isValidDate, isValidTime, parseAmount, parseMinutes, parseTitle } from '../../src/lib/validate'

describe('入力値の検証', () => {
  it('金額', () => {
    expect(parseAmount('1,200')).toEqual({ ok: true, value: 1200 })
    expect(parseAmount('１２００円')).toEqual({ ok: true, value: 1200 })
    expect(parseAmount('¥500')).toEqual({ ok: true, value: 500 })
    expect(parseAmount('').ok).toBe(false)
    expect(parseAmount('-100').ok).toBe(false)
    expect(parseAmount('12.5').ok).toBe(false)
    expect(parseAmount('0').ok).toBe(false)
    expect(parseAmount('abc').ok).toBe(false)
    expect(parseAmount('99999999').ok).toBe(false)
  })
  it('時間（分）', () => {
    expect(parseMinutes('')).toEqual({ ok: true, value: null })
    expect(parseMinutes('', 1440, false).ok).toBe(false)
    expect(parseMinutes('９０')).toEqual({ ok: true, value: 90 })
    expect(parseMinutes('1441').ok).toBe(false)
    expect(parseMinutes('-5').ok).toBe(false)
    expect(parseMinutes('1.5').ok).toBe(false)
  })
  it('日付・時刻・タイトル', () => {
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(parseTitle('   ').ok).toBe(false)
    expect(parseTitle(' 掃除 ')).toEqual({ ok: true, value: '掃除' })
  })
})
