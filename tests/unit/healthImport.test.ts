import { describe, expect, it } from 'vitest'
import { parseSleepText } from '../../src/lib/healthImport'
import { at } from './helpers'

const NOW = at('2026-10-15', 9)

describe('ヘルスケア睡眠の取り込み', () => {
  it('ショートカットの出力（yyyy-MM-dd HH:mm）を読み、起床日に記録する', () => {
    const r = parseSleepText('LIFEOS睡眠\n2026-10-14 23:42\n2026-10-15 07:05', NOW)
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ date: '2026-10-15', bedTime: '23:42', wakeTime: '07:05', durationMin: 443 }) })
  })
  it('順番が逆でも、複数あっても最初〜最後を使う', () => {
    const r = parseSleepText('2026-10-15 07:05\n2026-10-15 03:10\n2026-10-15 00:30\n2026-10-15 05:00', NOW)
    expect(r.ok && r.value).toMatchObject({ bedTime: '00:30', wakeTime: '07:05', durationMin: 395 })
  })
  it('日本語表記・全角・スラッシュ・ISO・午前午後も読める', () => {
    expect(parseSleepText('2026年10月14日 23:30〜2026年10月15日 6:30', NOW).ok).toBe(true)
    expect(parseSleepText('２０２６/１０/１４ ２３：３０\n2026/10/15 6:30', NOW).ok).toBe(true)
    expect(parseSleepText('2026-10-14T23:30:00+09:00 2026-10-15T06:30:00+09:00', NOW).ok).toBe(true)
    const r = parseSleepText('2026/10/14 午後11:30\n2026/10/15 午前6:30', NOW)
    expect(r.ok && r.value).toMatchObject({ bedTime: '23:30', wakeTime: '06:30' })
  })
  it('不正な内容は拒否', () => {
    expect(parseSleepText('', NOW).ok).toBe(false)
    expect(parseSleepText('2026-10-15 07:00', NOW).ok).toBe(false)
    expect(parseSleepText('2026-10-15 07:00\n2026-10-15 07:10', NOW).ok).toBe(false)
    expect(parseSleepText('2026-10-13 07:00\n2026-10-15 07:00', NOW).ok).toBe(false)
    expect(parseSleepText('2026-10-15 22:00\n2026-10-16 07:00', NOW).ok).toBe(false)
    expect(parseSleepText('2026-02-30 23:00\n2026-03-01 07:00', NOW).ok).toBe(false)
  })
})
