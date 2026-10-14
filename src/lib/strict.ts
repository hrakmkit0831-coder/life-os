// Strict Mode: 未完了を曖昧にせず、繰り返す原因には対策を示す
import { addDays, diffDays } from './date'
import { hasOpenChildren } from './planner'
import type { Cause, DailyCheckIn, DailyReview, ISODate, Task } from './types'

export const COUNTERMEASURES: Record<Cause, string[]> = {
  phone: ['作業中はスマホを別の部屋かカバンの中に置く', '集中タイマー中は機内モードにする', 'SNS・ゲームアプリをホーム画面の2ページ目以降に移す'],
  sleep: ['就寝目標の30分前に画面を閉じるアラームを設定する', '翌日の重要タスクを1件に減らす', '起床時刻を固定し、休日も1時間以内のずれにする'],
  too_big: ['60分を超えるタスクは分割してから計画に入れる', '「最初の5分」を書いてから計画に入れる'],
  overplanned: ['重要タスクを2件までにする', '推定時間の合計を使える時間の6割以内にする'],
  environment: ['作業場所を固定する（図書館・カフェ・机など）', '机の上には今のタスクに必要な物だけを置く'],
  unexpected: ['予定に30分の空き時間を入れておく', '最重要タスクを午前中に回す'],
  unclear: ['前日の夜に、明日の最重要タスクの「最初の5分」を書いておく'],
  other: ['自由記述を見直し、また起きそうなら対策を1つ決める'],
}

export interface RepeatedCause {
  cause: Cause
  count: number
  reviewCount: number
  measures: string[]
}

/** 直近 windowDays 日の振り返りで threshold 回以上出た原因 */
export function repeatedCauses(reviews: DailyReview[], today: ISODate, windowDays = 14, threshold = 3): RepeatedCause[] {
  const from = addDays(today, -windowDays + 1)
  const inRange = reviews.filter((r) => r.date >= from && r.date <= today)
  const counts = new Map<Cause, number>()
  for (const r of inRange) for (const c of new Set(r.causes)) counts.set(c, (counts.get(c) ?? 0) + 1)
  return [...counts.entries()]
    .filter(([c, n]) => n >= threshold && c !== 'other')
    .sort((a, b) => b[1] - a[1])
    .map(([cause, count]) => ({ cause, count, reviewCount: inRange.length, measures: COUNTERMEASURES[cause] }))
}

/** 過去の予定日のまま終わっていないタスク（自動では今日に持ち越さない） */
export function unfinishedPast(tasks: Task[], today: ISODate): Task[] {
  return tasks.filter(
    (t) => !t.deletedAt && t.status !== 'done' && t.plannedDate != null && t.plannedDate < today && !hasOpenChildren(t, tasks),
  )
}

export function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.deletedAt && t.status !== 'done' && !hasOpenChildren(t, tasks))
}

export function isOverdue(t: Task, today: ISODate): boolean {
  return !!t.dueDate && t.status !== 'done' && t.dueDate < today
}

export interface ResetSignal {
  suggested: boolean
  reasons: string[]
}

/** 立て直しモードを提案すべきか */
export function resetSignal(tasks: Task[], checkins: DailyCheckIn[], today: ISODate): ResetSignal {
  const reasons: string[] = []
  const past = checkins.map((c) => c.date).filter((d) => d < today).sort()
  const last = past[past.length - 1]
  if (last && diffDays(today, last) >= 3) reasons.push(`最後のチェックインから${diffDays(today, last)}日空いています`)
  const unfinished = unfinishedPast(tasks, today).length
  if (unfinished >= 6) reasons.push(`予定日を過ぎた未完了タスクが${unfinished}件あります`)
  const overdue = tasks.filter((t) => !t.deletedAt && isOverdue(t, today)).length
  if (overdue >= 4) reasons.push(`期限切れのタスクが${overdue}件あります`)
  return { suggested: reasons.length > 0, reasons }
}

export type TriageAction = 'continue' | 'postpone' | 'backlog' | 'delete' | 'split'

export const TRIAGE_LABEL: Record<TriageAction, string> = {
  continue: '今日やる',
  postpone: '延期',
  backlog: 'いつかやる',
  delete: '削除',
  split: '分割',
}

/** 仕分け結果をタスクに適用（split は呼び出し側で子タスク作成） */
export function applyTriage(t: Task, action: Exclude<TriageAction, 'split'>, today: ISODate, now: number, postponeTo?: ISODate): Task {
  switch (action) {
    case 'continue':
      return { ...t, plannedDate: today, status: t.status === 'postponed' ? 'todo' : t.status, updatedAt: now }
    case 'postpone':
      return { ...t, plannedDate: postponeTo ?? addDays(today, 1), status: 'postponed', postponeCount: t.postponeCount + 1, updatedAt: now }
    case 'backlog':
      return { ...t, plannedDate: null, status: 'postponed', postponeCount: t.postponeCount + 1, updatedAt: now }
    case 'delete':
      return { ...t, deletedAt: now, updatedAt: now }
  }
}
