// 進捗分析。データがない日は「記録なし」として扱い、架空の値を補わない
import { lastNDays, logicalDate, weekday } from './date'
import type { Cause, DataSet, ISODate, Task } from './types'

export interface Ratio {
  done: number
  total: number
}

export const rate = (r: Ratio): number | null => (r.total ? r.done / r.total : null)
export const pct = (r: Ratio): string => (r.total ? `${Math.round((r.done / r.total) * 100)}%` : '—')

export interface DayTop {
  date: ISODate
  planned: number
  done: number
  mitDone: boolean | null
}

/** チェックインで確定した重要タスクのうち、その日のうちに完了した件数 */
export function topTaskDays(data: Pick<DataSet, 'checkins' | 'tasks'>, dates: ISODate[], dayStartHour: number): DayTop[] {
  const byId = new Map<string, Task>(data.tasks.map((t) => [t.id, t]))
  const set = new Set(dates)
  const doneBy = (id: string, date: ISODate) => {
    const t = byId.get(id)
    return !!t && t.status === 'done' && t.completedAt != null && logicalDate(t.completedAt, dayStartHour) <= date
  }
  return data.checkins
    .filter((c) => set.has(c.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => ({
      date: c.date,
      planned: c.topTaskIds.length,
      done: c.topTaskIds.filter((id) => doneBy(id, c.date)).length,
      mitDone: c.mitTaskId ? doneBy(c.mitTaskId, c.date) : null,
    }))
}

export function habitRatio(data: Pick<DataSet, 'habits' | 'habitLogs'>, dates: ISODate[], dayStartHour: number): Ratio {
  const done = new Set(data.habitLogs.filter((l) => l.done).map((l) => l.key))
  let total = 0
  let d = 0
  for (const h of data.habits) {
    const created = logicalDate(h.createdAt, dayStartHour)
    for (const date of dates) {
      if (date < created || !h.weekdays.includes(weekday(date))) continue
      if (h.archived && !done.has(`${h.id}|${date}`)) continue
      total++
      if (done.has(`${h.id}|${date}`)) d++
    }
  }
  return { done: d, total }
}

export function seriesBy<T extends { date: ISODate }>(records: T[], dates: ISODate[], pick: (r: T) => number): (number | null)[] {
  const m = new Map(records.map((r) => [r.date, r]))
  return dates.map((d) => {
    const r = m.get(d)
    return r ? pick(r) : null
  })
}

export function expenseSeries(data: Pick<DataSet, 'expenseRecords'>, dates: ISODate[]): number[] {
  const m = new Map<ISODate, number>()
  for (const e of data.expenseRecords) m.set(e.date, (m.get(e.date) ?? 0) + e.amount)
  return dates.map((d) => m.get(d) ?? 0)
}

export function expenseTotal(data: Pick<DataSet, 'expenseRecords'>, from: ISODate, to: ISODate): number {
  return data.expenseRecords.filter((e) => e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0)
}

export function expenseByCategory(data: Pick<DataSet, 'expenseRecords'>, from: ISODate, to: ISODate): [string, number][] {
  const m = new Map<string, number>()
  for (const e of data.expenseRecords) if (e.date >= from && e.date <= to) m.set(e.category, (m.get(e.category) ?? 0) + e.amount)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export function focusMinByDate(data: Pick<DataSet, 'focusSessions'>, dates: ISODate[]): number[] {
  const m = new Map<ISODate, number>()
  for (const s of data.focusSessions) if (s.actualMin != null) m.set(s.date, (m.get(s.date) ?? 0) + s.actualMin)
  return dates.map((d) => m.get(d) ?? 0)
}

export function causeCounts(data: Pick<DataSet, 'reviews'>, dates: ISODate[]): { counts: [Cause, number][]; reviews: number } {
  const set = new Set(dates)
  const rs = data.reviews.filter((r) => set.has(r.date))
  const m = new Map<Cause, number>()
  for (const r of rs) for (const c of new Set(r.causes)) m.set(c, (m.get(c) ?? 0) + 1)
  return { counts: [...m.entries()].sort((a, b) => b[1] - a[1]), reviews: rs.length }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export interface Insight {
  text: string
  basis: string
  kind: 'trend' | 'hypothesis'
}

/** データから読み取れる傾向。各グループの日数が少ない場合は「仮説」として示す */
export function insights(data: DataSet, end: ISODate, days: number, dayStartHour: number, sleepGoalMin: number): Insight[] {
  const dates = lastNDays(end, days)
  const out: Insight[] = []
  const tops = topTaskDays(data, dates, dayStartHour).filter((d) => d.planned > 0)
  const topByDate = new Map(tops.map((d) => [d.date, d]))
  const MIN_GROUP = 3
  const SOLID = 7

  const compare = (label: string, a: DayTop[], b: DayTop[], aName: string, bName: string) => {
    if (a.length < MIN_GROUP || b.length < MIN_GROUP) return
    const ra = sumRate(a)
    const rb = sumRate(b)
    if (Math.abs(ra - rb) < 0.15) return
    const better = ra > rb ? aName : bName
    out.push({
      text: `${label}：${better}の日のほうが重要タスクの完了率が高い傾向`,
      basis: `${aName} ${Math.round(ra * 100)}%（${a.length}日） / ${bName} ${Math.round(rb * 100)}%（${b.length}日）`,
      kind: a.length >= SOLID && b.length >= SOLID ? 'trend' : 'hypothesis',
    })
  }

  // 睡眠と完了率
  const sleepMap = new Map(data.sleepRecords.map((s) => [s.date, s.durationMin]))
  const withSleep = tops.filter((d) => sleepMap.has(d.date))
  compare(
    '睡眠',
    withSleep.filter((d) => sleepMap.get(d.date)! >= sleepGoalMin),
    withSleep.filter((d) => sleepMap.get(d.date)! < sleepGoalMin),
    `睡眠${Math.round(sleepGoalMin / 6) / 10}時間以上`,
    '未満',
  )

  // SNS・ゲーム時間と完了率（中央値で2分割）
  const screen = data.screenTimeRecords.filter((r) => topByDate.has(r.date))
  if (screen.length >= MIN_GROUP * 2) {
    const vals = screen.map((r) => r.snsMin + r.gameMin + r.videoMin).sort((a, b) => a - b)
    const med = vals[Math.floor(vals.length / 2)]
    const low = screen.filter((r) => r.snsMin + r.gameMin + r.videoMin < med).map((r) => topByDate.get(r.date)!)
    const high = screen.filter((r) => r.snsMin + r.gameMin + r.videoMin >= med).map((r) => topByDate.get(r.date)!)
    compare('スマホ・ゲーム', low, high, `${med}分未満`, `${med}分以上`)
  }

  // 前半と後半の比較
  if (days >= 14) {
    const mid = dates[Math.floor(dates.length / 2)]
    const first = tops.filter((d) => d.date < mid)
    const second = tops.filter((d) => d.date >= mid)
    if (first.length >= 4 && second.length >= 4) {
      const a = sumRate(first)
      const b = sumRate(second)
      if (Math.abs(a - b) >= 0.1) {
        out.push({
          text: b > a ? '重要タスクの完了率が上がっています' : '重要タスクの完了率が下がっています',
          basis: `前半 ${Math.round(a * 100)}%（${first.length}日） → 後半 ${Math.round(b * 100)}%（${second.length}日）`,
          kind: first.length >= SOLID && second.length >= SOLID ? 'trend' : 'hypothesis',
        })
      }
    }
  }
  return out
}

function sumRate(ds: DayTop[]): number {
  const t = ds.reduce((s, d) => s + d.planned, 0)
  return t ? ds.reduce((s, d) => s + d.done, 0) / t : 0
}

export { avg }
