import { describe, expect, it } from 'vitest'
import { addDays, diffDays, lastNDays, logicalDate, sleepDuration, startOfMonth, startOfWeek } from '../../src/lib/date'
import { at } from './helpers'

describe('日付', () => {
  it('切り替え時刻より前は前日扱い（日付をまたいだ記録）', () => {
    expect(logicalDate(at('2026-10-15', 2, 30), 4)).toBe('2026-10-14')
    expect(logicalDate(at('2026-10-15', 4, 0), 4)).toBe('2026-10-15')
    expect(logicalDate(at('2026-10-15', 0, 30), 0)).toBe('2026-10-15')
    expect(logicalDate(at('2027-01-01', 1, 0), 4)).toBe('2026-12-31')
  })
  it('月末・年末・うるう年をまたぐ加算', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('日数差・週初め・月初め', () => {
    expect(diffDays('2026-11-02', '2026-10-30')).toBe(3)
    expect(startOfWeek('2026-10-15')).toBe('2026-10-12')
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12')
    expect(startOfMonth('2026-10-15')).toBe('2026-10-01')
    expect(lastNDays('2026-10-15', 3)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15'])
  })
  it('睡眠時間は日付またぎを考慮', () => {
    expect(sleepDuration('23:30', '07:00')).toBe(450)
    expect(sleepDuration('01:00', '08:00')).toBe(420)
    expect(sleepDuration('13:00', '14:30')).toBe(90)
  })
})
