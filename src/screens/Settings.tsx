import { useEffect, useRef, useState } from 'react'
import { HabitManager } from '../components/habits'
import { Seg, TopBar } from '../components/ui'
import { buildBackup, backupFileName, downloadJSON, parseBackup, type BackupFile } from '../lib/backup'
import { SCHEMA_VERSION } from '../lib/db'
import { useStore } from '../lib/store'
import type { StoreName } from '../lib/types'

const STORE_LABEL: Record<StoreName, string> = {
  tasks: 'タスク',
  habits: '習慣',
  habitLogs: '習慣の記録',
  checkins: 'チェックイン',
  reviews: '振り返り',
  focusSessions: '集中セッション',
  sleepRecords: '睡眠',
  exerciseRecords: '運動',
  healthRecords: '食事・体調',
  timeRecords: '勉強・仕事',
  screenTimeRecords: 'スマホ・ゲーム',
  expenseRecords: '支出',
  settings: '設定',
}

export function Settings() {
  const { data, settings, actions, toast } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ backup: BackupFile; counts: Record<StoreName, number> } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<string | null>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024).toFixed(0)} KB`)).catch(() => {})
  }, [])

  const exportNow = async () => {
    const now = new Date()
    try {
      downloadJSON(buildBackup(data, now), backupFileName(now))
      await actions.updateSettings({ lastExportAt: now.getTime() }, 'バックアップを書き出しました')
    } catch (e) {
      toast(`書き出しに失敗しました：${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const r = parseBackup(await f.text())
    if (fileRef.current) fileRef.current.value = ''
    if (!r.ok) return toast(`読み込めません：${r.error}`, 'error')
    setPending({ backup: r.backup, counts: r.counts })
  }

  const confirmImport = async () => {
    if (!pending) return
    if (!confirm('現在のデータはすべて置き換えられます。元に戻せません。\n（念のため先に現在のデータを書き出すことをおすすめします）\n\n読み込みますか？')) return
    if (await actions.importData(pending.backup.data)) setPending(null)
  }

  const wipe = async () => {
    if (!confirm('この端末の LIFE OS のデータをすべて削除します。元に戻せません。続けますか？')) return
    const word = prompt('確認のため「削除」と入力してください')
    if (word !== '削除') return toast('削除を中止しました')
    await actions.clearAllData()
  }

  return (
    <>
      <TopBar title="設定" back="/" />

      <section className="card">
        <h2>Strict Mode</h2>
        <Seg label="Strict Mode" value={settings.strictMode ? 'on' : 'off'} onChange={(v) => actions.updateSettings({ strictMode: v === 'on' }, v === 'on' ? 'Strict Mode をオンにしました' : 'Strict Mode をオフにしました')} options={[['on', 'オン'], ['off', 'オフ']]} />
        <ul className="small muted" style={{ margin: '10px 0 0', paddingLeft: 18 }}>
          <li>重要タスクは最大3件（オフでも上限は3件）</li>
          <li>今日やるタスクには推定時間、最重要タスクには「最初の5分」が必要</li>
          <li>振り返りでは、未完了タスクすべての次の対応と原因の選択が必要</li>
          <li>同じ原因が直近14日で3回以上あれば対策を表示</li>
          <li>罰則や連続記録のリセット表示はありません。過去の記録は常に残ります</li>
        </ul>
      </section>

      <section className="card">
        <h2>1日の切り替え時刻</h2>
        <Seg label="1日の切り替え時刻" value={String(settings.dayStartHour)} onChange={(v) => actions.updateSettings({ dayStartHour: Number(v) }, '切り替え時刻を変更しました')} options={[['0', '0時'], ['2', '2時'], ['3', '3時'], ['4', '4時'], ['5', '5時']]} />
        <div className="small muted" style={{ marginTop: 8 }}>
          この時刻より前の記録は前日として扱います（例：4時なら、深夜2時の作業は前日の分）。
        </div>
      </section>

      <section className="card">
        <h2>習慣</h2>
        <HabitManager />
      </section>

      <section className="card">
        <h2>データの保存とバックアップ</h2>
        <div className="small muted stack">
          <p>
            データはこの端末のブラウザ内（IndexedDB）にだけ保存されます。外部サーバーへの送信・解析サービス・外部AIは一切使っていません。
          </p>
          <p>
            そのため、端末の故障・Safari の「履歴とWebサイトデータを消去」・アプリの削除でデータは消えます。定期的に書き出して、iCloud Drive などに保存してください。
          </p>
          <p>
            永続保存：{persisted == null ? '確認できません' : persisted ? '許可済み（ブラウザが自動削除しにくい状態）' : '未許可（ホーム画面に追加すると保護されやすくなります）'}
            {usage && ` ／ 使用量：約${usage}`}
          </p>
          <p>最終バックアップ：{settings.lastExportAt ? new Date(settings.lastExportAt).toLocaleString('ja-JP') : 'まだありません'}</p>
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn primary block" onClick={exportNow}>
            JSON で書き出す（バックアップ）
          </button>
          <button className="btn block" onClick={() => fileRef.current?.click()}>
            JSON を読み込む（復元）
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file" />
        </div>
        {pending && (
          <div className="card warn" style={{ marginTop: 12, marginBottom: 0 }}>
            <h2>読み込み内容の確認</h2>
            <div className="small">書き出し日時：{new Date(pending.backup.exportedAt).toLocaleString('ja-JP')}</div>
            <table className="chart-table">
              <tbody>
                {(Object.keys(pending.counts) as StoreName[])
                  .filter((k) => k !== 'settings')
                  .map((k) => (
                    <tr key={k}>
                      <td>{STORE_LABEL[k]}</td>
                      <td>
                        {pending.counts[k]}件（現在 {data[k].length}件）
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="small warn-t" style={{ margin: '8px 0' }}>現在のデータはすべてこの内容に置き換わります。</div>
            <div className="btns">
              <button className="btn" onClick={() => setPending(null)}>
                やめる
              </button>
              <button className="btn primary" onClick={confirmImport}>
                置き換えて読み込む
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>データの削除</h2>
        <div className="small muted" style={{ marginBottom: 10 }}>
          この端末に保存された LIFE OS のデータをすべて削除します。
        </div>
        <button className="btn danger block" onClick={wipe}>
          すべてのデータを削除
        </button>
      </section>

      <section className="card small muted">
        <h2>このアプリについて</h2>
        <p>LIFE OS v1.0 ／ データ形式 v{SCHEMA_VERSION}</p>
        <p style={{ marginTop: 8 }}>Web アプリの制約により、次のことはできません：</p>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          <li>スクリーンタイム・アプリ使用時間の自動取得（手入力）</li>
          <li>アプリを閉じている間のタイマー終了通知</li>
          <li>他の端末とのデータ同期（JSON の書き出し・読み込みで移行）</li>
        </ul>
      </section>
    </>
  )
}
