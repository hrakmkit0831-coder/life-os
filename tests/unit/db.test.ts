import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackup, parseBackup } from '../../src/lib/backup'
import { DB_NAME, loadAll, replaceAll, resetConnection, writeOps } from '../../src/lib/db'
import { applyOps, emptyData } from '../../src/lib/store'
import { task } from './helpers'

beforeEach(async () => {
  resetConnection()
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = req.onerror = req.onblocked = () => r()
  })
})

describe('IndexedDB 保存', () => {
  it('保存したデータは接続し直しても残る（リロード相当）', async () => {
    const t = task({ id: 'keep', title: '保存テスト' })
    await writeOps([{ store: 'tasks', put: t }, { store: 'expenseRecords', put: { id: 'e1', date: '2026-10-15', amount: 500, category: '食費', memo: '', createdAt: 0 } }])
    resetConnection()
    const d = await loadAll()
    expect(d.tasks.map((x) => x.title)).toEqual(['保存テスト'])
    expect(d.expenseRecords[0].amount).toBe(500)
  })
  it('同じ日付キーの記録は上書き（1日1件）', async () => {
    await writeOps([{ store: 'sleepRecords', put: { date: '2026-10-15', bedTime: '23:00', wakeTime: '06:00', durationMin: 420, updatedAt: 1 } }])
    await writeOps([{ store: 'sleepRecords', put: { date: '2026-10-15', bedTime: '00:00', wakeTime: '06:00', durationMin: 360, updatedAt: 2 } }])
    const d = await loadAll()
    expect(d.sleepRecords).toHaveLength(1)
    expect(d.sleepRecords[0].durationMin).toBe(360)
  })
  it('削除', async () => {
    await writeOps([{ store: 'tasks', put: task({ id: 'x' }) }])
    await writeOps([{ store: 'tasks', delete: 'x' }])
    expect((await loadAll()).tasks).toHaveLength(0)
  })
  it('トランザクション失敗時は何も書き込まれない', async () => {
    await expect(writeOps([{ store: 'tasks', put: task({ id: 'ok' }) }, { store: 'tasks', put: { title: 'キーなし' } }])).rejects.toBeTruthy()
    expect((await loadAll()).tasks).toHaveLength(0)
  })
  it('メモリ上の反映（applyOps）は IndexedDB と同じ結果になる', async () => {
    const ops = [
      { store: 'tasks' as const, put: task({ id: 'a' }) },
      { store: 'tasks' as const, put: task({ id: 'b' }) },
      { store: 'tasks' as const, delete: 'a' },
    ]
    await writeOps(ops)
    const mem = applyOps(emptyData(), ops)
    expect(mem.tasks.map((t) => t.id)).toEqual((await loadAll()).tasks.map((t) => t.id))
  })
})

describe('エクスポート / インポート', () => {
  it('書き出し → 検証 → 置き換えで同じデータに戻る', async () => {
    const data = emptyData()
    data.tasks.push(task({ id: 't1', title: '往復テスト' }))
    data.expenseRecords.push({ id: 'e', date: '2026-10-15', amount: 1234, category: '食費', memo: 'メモ', createdAt: 1 })
    const json = JSON.stringify(buildBackup(data))
    const parsed = parseBackup(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.counts.tasks).toBe(1)
    await writeOps([{ store: 'tasks', put: task({ id: 'old' }) }])
    await replaceAll(parsed.backup.data)
    const d = await loadAll()
    expect(d.tasks.map((t) => t.id)).toEqual(['t1'])
    expect(d.expenseRecords[0].amount).toBe(1234)
  })
  it('不正なファイルは拒否する', () => {
    expect(parseBackup('not json').ok).toBe(false)
    expect(parseBackup(JSON.stringify({ app: 'other', schemaVersion: 1, data: {} })).ok).toBe(false)
    expect(parseBackup(JSON.stringify({ app: 'life-os', schemaVersion: 99, data: {} }))).toMatchObject({ ok: false })
    const dup = buildBackup({ ...emptyData(), tasks: [task({ id: 'd' }), task({ id: 'd' })] })
    expect(parseBackup(JSON.stringify(dup))).toMatchObject({ ok: false })
    const badAmount = buildBackup({ ...emptyData(), expenseRecords: [{ id: 'e', date: '2026-10-15', amount: -1, category: '', memo: '', createdAt: 0 }] })
    expect(parseBackup(JSON.stringify(badAmount)).ok).toBe(false)
    const badDate = { app: 'life-os', schemaVersion: 1, exportedAt: '', data: { sleepRecords: [{ date: '2026-02-30', durationMin: 1 }] } }
    expect(parseBackup(JSON.stringify(badDate)).ok).toBe(false)
  })
  it('欠けているストアは空として扱う（古い形式との互換）', () => {
    const r = parseBackup(JSON.stringify({ app: 'life-os', schemaVersion: 1, exportedAt: '', data: { tasks: [] } }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.backup.data.settings).toHaveLength(1)
  })
})
