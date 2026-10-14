import type { ISODate } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 論理日付: dayStartHour 時より前は前日扱い（深夜0〜4時の作業を前日として数える） */
export function logicalDate(ts: number | Date, dayStartHour: number): ISODate {
  const d = new Date(typeof ts === 'number' ? ts : ts.getTime())
  d.setHours(d.getHours() - dayStartHour)
  return toISODate(d)
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function diffDays(a: ISODate, b: ISODate): number {
  // a - b（日数）。DST の影響を避けるため UTC で計算
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

export function weekday(date: ISODate): number {
  return parseISODate(date).getDay()
}

/** end を含む直近 n 日の日付（古い順） */
export function lastNDays(end: ISODate, n: number): ISODate[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1))
}

/** 月曜始まりの週の初日 */
export function startOfWeek(date: ISODate): ISODate {
  const wd = weekday(date)
  return addDays(date, -((wd + 6) % 7))
}

export function startOfMonth(date: ISODate): ISODate {
  return date.slice(0, 8) + '01'
}

const WD = ['日', '月', '火', '水', '木', '金', '土']

export function formatJa(date: ISODate): string {
  const d = parseISODate(date)
  return `${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`
}

export function formatShort(date: ISODate): string {
  const d = parseISODate(date)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** 就寝→起床の睡眠時間（分）。就寝時刻が起床より後なら前日に寝たとみなす（日付またぎ） */
export function sleepDuration(bed: string, wake: string): number {
  const b = timeToMin(bed)
  const w = timeToMin(wake)
  return w > b ? w - b : w + 1440 - b
}

export function formatMin(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}分`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}時間${r}分` : `${h}時間`
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${pad(m)}:${pad(s)}`
}
