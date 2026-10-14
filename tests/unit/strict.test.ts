import { describe, expect, it } from 'vitest'
import { applyTriage, repeatedCauses, resetSignal, unfinishedPast } from '../../src/lib/strict'
import type { Cause, DailyReview } from '../../src/lib/types'
import { checkin, task } from './helpers'

const today = '2026-10-15'
const review = (date: string, causes: Cause[]): DailyReview => ({
  date, mitDone: false, achieved: '', missed: '', causes, note: '', improvement: 'x', plannedTopCount: 1, doneTopCount: 0, plannedMin: 0, actualFocusMin: 0, createdAt: 0, updatedAt: 0,
})

describe('Strict Mode', () => {
  it('同じ原因が直近14日で3回以上なら対策を出す', () => {
    const rs = [review('2026-10-15', ['phone']), review('2026-10-13', ['phone', 'sleep']), review('2026-10-10', ['phone']), review('2026-09-01', ['sleep'])]
    const r = repeatedCauses(rs, today)
    expect(r).toHaveLength(1)
    expect(r[0].cause).toBe('phone')
    expect(r[0].count).toBe(3)
    expect(r[0].reviewCount).toBe(3)
    expect(r[0].measures.length).toBeGreaterThan(0)
  })
  it('過去の予定日の未完了は自動で今日に移さず、仕分け対象として返す', () => {
    const ts = [
      task({ id: 'old', plannedDate: '2026-10-14' }),
      task({ id: 'today', plannedDate: today }),
      task({ id: 'doneOld', plannedDate: '2026-10-13', status: 'done' }),
      task({ id: 'deleted', plannedDate: '2026-10-13', deletedAt: 1 }),
      task({ id: 'backlog', plannedDate: null }),
    ]
    expect(unfinishedPast(ts, today).map((t) => t.id)).toEqual(['old'])
    expect(ts.find((t) => t.id === 'old')!.plannedDate).toBe('2026-10-14')
  })
  it('仕分け：今日やる・延期・いつか・削除', () => {
    const t = task({ plannedDate: '2026-10-14', status: 'postponed' })
    expect(applyTriage(t, 'continue', today, 5)).toMatchObject({ plannedDate: today, status: 'todo' })
    expect(applyTriage(t, 'postpone', today, 5, '2026-10-20')).toMatchObject({ plannedDate: '2026-10-20', status: 'postponed', postponeCount: 1 })
    expect(applyTriage(t, 'backlog', today, 5)).toMatchObject({ plannedDate: null })
    expect(applyTriage(t, 'delete', today, 5).deletedAt).toBe(5)
  })
  it('数日空いたら立て直しモードを提案', () => {
    expect(resetSignal([], [checkin('2026-10-11', [])], today).suggested).toBe(true)
    expect(resetSignal([], [checkin('2026-10-14', [])], today).suggested).toBe(false)
    const many = Array.from({ length: 6 }, () => task({ plannedDate: '2026-10-10' }))
    expect(resetSignal(many, [checkin('2026-10-14', [])], today).reasons[0]).toContain('6件')
  })
})
