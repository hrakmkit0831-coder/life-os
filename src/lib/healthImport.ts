// iPhone ショートカット経由の睡眠データ取り込み。
// Web アプリはヘルスケアを直接読めないため、ショートカットがクリップボードにコピーした
// 「就寝日時・起床日時」のテキストを解析する。
import { toISODate } from './date'
import type { ISODate } from './types'
import { toHalfWidth, type Result } from './validate'

export interface ParsedSleep {
  date: ISODate // 起床した日
  bedTime: string
  wakeTime: string
  durationMin: number
  bedAt: number
  wakeAt: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const DT = /(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?[ T　]*(?:午前|午後)?\s*(\d{1,2})[:：時](\d{2})/g

/** テキスト中の日時をすべて拾い、最も早いものを就寝・最も遅いものを起床とする */
export function parseSleepText(text: string, now = Date.now()): Result<ParsedSleep> {
  const src = toHalfWidth(text)
  const times: number[] = []
  for (const m of src.matchAll(DT)) {
    let h = Number(m[4])
    const pm = m[0].includes('午後')
    if (pm && h < 12) h += 12
    if (m[0].includes('午前') && h === 12) h = 0
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5]))
    if (!Number.isNaN(d.getTime()) && d.getMonth() === Number(m[2]) - 1) times.push(d.getTime())
  }
  if (times.length < 2) return { ok: false, error: '就寝と起床の日時が見つかりません。ショートカットを実行してから取り込んでください' }
  const bedAt = Math.min(...times)
  const wakeAt = Math.max(...times)
  const durationMin = Math.round((wakeAt - bedAt) / 60000)
  if (durationMin < 30) return { ok: false, error: '睡眠時間が30分未満です。ヘルスケアの記録を確認してください' }
  if (durationMin > 16 * 60) return { ok: false, error: '睡眠時間が16時間を超えています。ショートカットの「過去1日」の条件を確認してください' }
  if (wakeAt > now + 10 * 60000) return { ok: false, error: '起床時刻が未来になっています' }
  const b = new Date(bedAt)
  const w = new Date(wakeAt)
  return {
    ok: true,
    value: { date: toISODate(w), bedTime: `${pad(b.getHours())}:${pad(b.getMinutes())}`, wakeTime: `${pad(w.getHours())}:${pad(w.getMinutes())}`, durationMin, bedAt, wakeAt },
  }
}

export async function readClipboard(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.readText) return null
    return await navigator.clipboard.readText()
  } catch {
    return null // 許可されなかった場合は手動貼り付けにフォールバック
  }
}
