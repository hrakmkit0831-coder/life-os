import { describe, expect, it } from 'vitest'
import { buildPlan, candidates, suggestBreakdown } from '../../src/lib/planner'
import { task } from './helpers'

const today = '2026-10-15'

describe('朝の計画（ルールベース）', () => {
  const tasks = [
    task({ id: 'a', priority: 'high', estimateMin: 45 }),
    task({ id: 'b', priority: 'mid', dueDate: today, estimateMin: 30 }),
    task({ id: 'c', priority: 'low', estimateMin: 30 }),
    task({ id: 'future', plannedDate: '2026-10-20' }),
    task({ id: 'done', status: 'done' }),
  ]
  it('候補は未完了・予定日が今日以前のみ。期限が今日のものを優先', () => {
    expect(candidates(tasks, today).map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })
  it('エネルギーが低い日は1件だけ', () => {
    const p = buildPlan({ energy: 'low', availableMin: null, tasks, today, mitTaskId: null })
    expect(p.topTaskIds).toEqual(['b'])
    expect(p.tips[0]).toContain('エネルギーが低い')
  })
  it('高い日は3件まで、ただし使える時間の6割を超えない', () => {
    expect(buildPlan({ energy: 'high', availableMin: null, tasks, today, mitTaskId: null }).topTaskIds).toHaveLength(3)
    const p = buildPlan({ energy: 'high', availableMin: 100, tasks, today, mitTaskId: 'a' })
    expect(p.capacityMin).toBe(60)
    expect(p.topTaskIds).toEqual(['a'])
  })
  it('最重要タスクが容量を超えると分割を促す', () => {
    const big = task({ id: 'big', estimateMin: 180 })
    const p = buildPlan({ energy: 'mid', availableMin: 120, tasks: [big], today, mitTaskId: 'big' })
    expect(p.warnings.join()).toContain('分割')
  })
  it('分割済みの親タスクは候補に出ない', () => {
    const parent = task({ id: 'p' })
    const child = task({ id: 'c1', parentId: 'p' })
    expect(candidates([parent, child], today).map((t) => t.id)).toEqual(['c1'])
  })
})

describe('タスク分解の提案', () => {
  it('大きい・曖昧なタスクを検出してテンプレートを出す', () => {
    const b = suggestBreakdown({ title: '企画書を作る', estimateMin: 120, firstStep: '' })
    expect(b.tooBig).toBe(true)
    expect(b.steps[0]).toContain('見出し')
    expect(b.reasons.length).toBeGreaterThanOrEqual(2)
  })
  it('具体的で短いタスクは分割不要', () => {
    expect(suggestBreakdown({ title: '田中さんに日程の返信メールを送る', estimateMin: 10, firstStep: 'Gmailを開く' }).tooBig).toBe(false)
  })
})
