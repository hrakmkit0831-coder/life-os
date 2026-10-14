// 入力値の検証。成功時は正規化済みの値、失敗時はエラーメッセージを返す

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const ng = <T>(error: string): Result<T> => ({ ok: false, error })

/** 全角数字・カンマ・円記号を許容して整数の金額にする */
export function parseAmount(input: string): Result<number> {
  const s = toHalfWidth(input).replace(/[,，¥円\s]/g, '')
  if (s === '') return ng('金額を入力してください')
  if (!/^\d+$/.test(s)) return ng('金額は0以上の整数（円）で入力してください')
  const n = Number(s)
  if (n <= 0) return ng('金額は1円以上にしてください')
  if (n > 10_000_000) return ng('金額が大きすぎます（1,000万円まで）')
  return ok(n)
}

/** 分数。空欄は 0 または null（allowEmpty） */
export function parseMinutes(input: string, max = 1440, allowEmpty = true): Result<number | null> {
  const s = toHalfWidth(input).trim()
  if (s === '') return allowEmpty ? ok(null) : ng('時間（分）を入力してください')
  if (!/^\d+$/.test(s)) return ng('時間は0以上の整数（分）で入力してください')
  const n = Number(s)
  if (n > max) return ng(`時間は${max}分以内で入力してください`)
  return ok(n)
}

export function isValidTime(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false
  const [h, m] = s.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y >= 2000 && y <= 2100
}

export function parseTitle(input: string, label = 'タスク名'): Result<string> {
  const s = input.trim()
  if (!s) return ng(`${label}を入力してください`)
  if (s.length > 120) return ng(`${label}は120文字以内にしてください`)
  return ok(s)
}

export function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/：/g, ':')
}
