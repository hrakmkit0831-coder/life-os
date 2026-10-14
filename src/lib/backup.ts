// JSON エクスポート / インポート（形式検証つき）
import { SCHEMA_VERSION } from './db'
import { isValidDate } from './validate'
import { DEFAULT_SETTINGS, STORE_KEYS, STORE_NAMES, type DataSet, type StoreName } from './types'

export const BACKUP_APP_ID = 'life-os'

export interface BackupFile {
  app: typeof BACKUP_APP_ID
  schemaVersion: number
  exportedAt: string
  data: DataSet
}

export function buildBackup(data: DataSet, now = new Date()): BackupFile {
  return { app: BACKUP_APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), data }
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `life-os-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`
}

const DATE_KEYED: StoreName[] = ['checkins', 'reviews', 'sleepRecords', 'exerciseRecords', 'healthRecords', 'timeRecords', 'screenTimeRecords']

export type ParseResult = { ok: true; backup: BackupFile; counts: Record<StoreName, number> } | { ok: false; error: string }

/** インポート前の検証。不正なファイルは1件でも問題があれば全体を拒否する */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSON として読み込めませんでした' }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'ファイル形式が正しくありません' }
  const b = raw as Partial<BackupFile>
  if (b.app !== BACKUP_APP_ID) return { ok: false, error: 'LIFE OS のバックアップファイルではありません' }
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion < 1) return { ok: false, error: 'バージョン情報がありません' }
  if (b.schemaVersion > SCHEMA_VERSION)
    return { ok: false, error: `新しいバージョン（v${b.schemaVersion}）のファイルです。アプリを更新してから読み込んでください` }
  if (!b.data || typeof b.data !== 'object') return { ok: false, error: 'データ本体がありません' }

  const data = {} as Record<StoreName, unknown[]>
  const counts = {} as Record<StoreName, number>
  for (const name of STORE_NAMES) {
    const arr = (b.data as unknown as Record<string, unknown>)[name] ?? []
    if (!Array.isArray(arr)) return { ok: false, error: `${name} の形式が正しくありません` }
    const key = STORE_KEYS[name]
    const seen = new Set<unknown>()
    for (const [i, rec] of arr.entries()) {
      if (!rec || typeof rec !== 'object') return { ok: false, error: `${name} の ${i + 1} 件目が不正です` }
      const k = (rec as Record<string, unknown>)[key]
      if (typeof k !== 'string' || !k) return { ok: false, error: `${name} の ${i + 1} 件目にキー（${key}）がありません` }
      if (seen.has(k)) return { ok: false, error: `${name} にキーの重複があります（${k}）` }
      seen.add(k)
      if (DATE_KEYED.includes(name) && !isValidDate(k)) return { ok: false, error: `${name} の日付が不正です（${k}）` }
      const err = checkRecord(name, rec as Record<string, unknown>)
      if (err) return { ok: false, error: `${name} の ${i + 1} 件目: ${err}` }
    }
    data[name] = arr
    counts[name] = arr.length
  }
  if (data.settings.length === 0) data.settings = [{ ...DEFAULT_SETTINGS }]
  return { ok: true, backup: { ...(b as BackupFile), data: data as unknown as DataSet }, counts }
}

function checkRecord(name: StoreName, r: Record<string, unknown>): string | null {
  const num = (k: string) => typeof r[k] === 'number' && Number.isFinite(r[k])
  switch (name) {
    case 'tasks':
      if (typeof r.title !== 'string') return 'タイトルがありません'
      if (!['todo', 'doing', 'done', 'postponed'].includes(r.status as string)) return '状態が不正です'
      return null
    case 'expenseRecords':
      if (!num('amount') || (r.amount as number) < 0) return '金額が不正です'
      if (!isValidDate(r.date)) return '日付が不正です'
      return null
    case 'focusSessions':
      if (!num('startAt') || !num('plannedEndAt')) return '時刻が不正です'
      return null
    case 'sleepRecords':
      if (!num('durationMin')) return '睡眠時間が不正です'
      return null
    case 'habitLogs':
      if (typeof r.habitId !== 'string' || !isValidDate(r.date)) return '習慣記録が不正です'
      return null
    default:
      return null
  }
}

export function downloadJSON(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
