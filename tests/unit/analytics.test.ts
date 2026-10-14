import { describe, expect, it } from 'vitest'
import { causeCounts, expenseByCategory, expenseTotal, habitRatio, insights, pct, seriesBy, topTaskDays } from '../../src/lib/analytics'
import { lastNDays } from '../../src/lib/date'
import { emptyData } from '../../src/lib/store'
import type { ExpenseRecord, Habit } from '../../src/lib/types'
import { at, checkin, task } from './helpers'

const today = '2026-10-15'

describe('分析', () => {
  it('完了率の分母はチェックインで確定した重要タスク。翌日以降の完了は数えない', () => {
    const data = {
      tasks: [
        task({ id: 'a', status: 'done', completedAt: at('2026-10-14', 20) }),
        task({ id: 'b', status: 'done', completedAt: at('2026-10-15', 10) }), // 14日の計画だが15日に完了
        task({ id: 'c', status: 'done', completedAt: at('2026-10-15', 2) }), // 深夜2時 = 14日扱い
      ],
      checkins: [checkin('2026-10-14', ['a', 'b', 'c'])],
    }
    const [d] = topTaskDays(data, ['2026-10-14'], 4)
    expect(d).toMatchObject({ planned: 3, done: 2, mitDone: true })
  })
  it('習慣の実施率：作成日以降・予定曜日のみが分母', () => {
    const h: Habit = { id: 'h', name: '筋トレ', minimum: '', weekdays: [1, 3, 5], archived: false, createdAt: at('2026-10-12', 9), order: 0 }
    const logs = [{ key: 'h|2026-10-12', habitId: 'h', date: '2026-10-12', done: true, updatedAt: 0 }]
    const r = habitRatio({ habits: [h], habitLogs: logs }, lastNDays(today, 7), 4)
    expect(r).toEqual({ done: 1, total: 2 }) // 10/12(月), 10/14(水)
    expect(pct(r)).toBe('50%')
    expect(pct({ done: 0, total: 0 })).toBe('—')
  })
  it('支出の日・期間・カテゴリ集計', () => {
    const e = (date: string, amount: number, category: string): ExpenseRecord => ({ id: `${date}${amount}`, date, amount, category, memo: '', createdAt: 0 })
    const data = { expenseRecords: [e('2026-10-15', 500, '食費'), e('2026-10-15', 1200, '外食'), e('2026-10-13', 300, '食費'), e('2026-09-30', 9999, '食費')] }
    expect(expenseTotal(data, today, today)).toBe(1700)
    expect(expenseTotal(data, '2026-10-12', '2026-10-18')).toBe(2000)
    expect(expenseTotal(data, '2026-10-01', '2026-10-31')).toBe(2000)
    expect(expenseByCategory(data, '2026-10-01', '2026-10-31')).toEqual([['外食', 1200], ['食費', 800]])
  })
  it('記録がない日は null（0 と区別して架空の値を作らない）', () => {
    const s = seriesBy([{ date: '2026-10-14', durationMin: 400 }], ['2026-10-13', '2026-10-14'], (r) => r.durationMin)
    expect(s).toEqual([null, 400])
  })
  it('原因の集計', () => {
    const r = causeCounts({ reviews: [{ date: today, causes: ['phone', 'sleep'] } as never, { date: '2026-10-14', causes: ['phone'] } as never] }, lastNDays(today, 7))
    expect(r.reviews).toBe(2)
    expect(r.counts[0]).toEqual(['phone', 2])
  })
  it('データが少ない場合は傾向を出さない／少数なら仮説扱い', () => {
    expect(insights(emptyData(), today, 7, 4, 420)).toEqual([])
    const data = emptyData()
    const days = lastNDays(today, 6)
    days.forEach((d, i) => {
      const t = task({ id: `x${i}`, status: i < 3 ? 'done' : 'todo', completedAt: i < 3 ? at(d, 20) : null })
      data.tasks.push(t)
      data.checkins.push(checkin(d, [t.id]))
      data.sleepRecords.push({ date: d, bedTime: '23:00', wakeTime: '07:00', durationMin: i < 3 ? 480 : 300, updatedAt: 0 })
    })
    const ins = insights(data, today, 7, 4, 420)
    expect(ins).toHaveLength(1)
    expect(ins[0].kind).toBe('hypothesis')
    expect(ins[0].basis).toContain('100%（3日）')
  })
})
