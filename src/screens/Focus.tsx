import { useEffect, useRef, useState } from 'react'
import { Chip, Icon, TopBar } from '../components/ui'
import { formatClock } from '../lib/date'
import { go } from '../lib/router'
import { useStore } from '../lib/store'
import * as timer from '../lib/timer'
import type { FocusSession } from '../lib/types'
import { parseMinutes } from '../lib/validate'
import { resolveNext, useNow } from './Home'

const PRESETS = [5, 15, 25, 45, 60]

/** 終了音（アプリを開いているときだけ鳴る。バックグラウンド通知は Web では保証できない） */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.2, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.8)
  } catch {
    /* 音が出せない環境では何もしない */
  }
}

export function Focus({ query }: { query: URLSearchParams }) {
  const { data, actions, today } = useStore()
  const now = useNow(250)
  const running = data.focusSessions.find((s) => s.status === 'running' || s.status === 'paused')
  const [finished, setFinished] = useState<FocusSession | null>(null)
  const [taskId, setTaskId] = useState<string | null>(query.get('task'))
  const [min, setMin] = useState('25')
  const [err, setErr] = useState<string | null>(null)
  const beeped = useRef<string | null>(null)

  const task = (id: string | null) => (id ? data.tasks.find((t) => t.id === id) : undefined)
  const checkin = data.checkins.find((c) => c.date === today)
  const options = data.tasks.filter((t) => !t.deletedAt && t.status !== 'done').sort((a, b) => Number(checkin?.topTaskIds.includes(b.id)) - Number(checkin?.topTaskIds.includes(a.id)))

  const timeUp = running ? timer.isTimeUp(running, now) : false
  useEffect(() => {
    if (running && timeUp && beeped.current !== running.id) {
      beeped.current = running.id
      beep()
    }
  }, [running, timeUp])

  const start = async () => {
    const m = parseMinutes(min, 240, false)
    if (!m.ok || !m.value) return setErr(m.ok ? '1分以上にしてください' : m.error)
    setErr(null)
    setFinished(null)
    await actions.startFocus(taskId, m.value, m.value <= 5 ? 'starter' : 'focus')
  }

  const end = async (s: FocusSession, status: 'completed' | 'stopped') => {
    const f = await actions.finishFocus(s, status)
    if (f) setFinished(f)
  }

  // ---- 実行中 ----
  if (running) {
    const t = task(running.taskId)
    const remain = timer.remainingMs(running, now)
    const total = running.plannedEndAt - running.startAt - running.pausedTotalMs
    const progress = total > 0 ? 1 - remain / total : 1
    const C = 2 * Math.PI * 46
    return (
      <>
        <TopBar title={running.kind === 'starter' ? '5分だけ始める' : '集中'} back="/" />
        <div className="center">
          <div className="break" style={{ fontWeight: 700, fontSize: 18 }}>
            {t?.title ?? 'タスクなし'}
          </div>
          {t?.firstStep && <div className="small muted break">最初の5分：{t.firstStep}</div>}
        </div>
        <div className="ring-wrap">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
          </svg>
          <div className="inner">
            <div className="huge num" aria-live="off" data-testid="remaining">
              {formatClock(remain)}
            </div>
            <div className="small muted">{timeUp ? '時間です' : running.status === 'paused' ? '一時停止中' : `${running.plannedMin}分セッション`}</div>
          </div>
        </div>
        {timeUp ? (
          <div className="stack">
            <button className="btn primary block lg" onClick={() => end(running, 'completed')}>
              記録して終える
            </button>
          </div>
        ) : (
          <div className="stack">
            {running.status === 'paused' ? (
              <button className="btn primary block lg" onClick={() => actions.saveFocus(timer.resume(running, Date.now()))}>
                <Icon name="play" size={18} />
                再開
              </button>
            ) : (
              <button className="btn block lg" onClick={() => actions.saveFocus(timer.pause(running, Date.now()))}>
                <Icon name="pause" size={18} />
                一時停止
              </button>
            )}
            <div className="btns">
              <button className="btn" onClick={() => end(running, 'stopped')}>
                ここで終える
              </button>
              <button className="btn primary" onClick={() => end(running, 'completed')}>
                完了
              </button>
            </div>
          </div>
        )}
        <p className="tiny dim center" style={{ marginTop: 16 }}>
          開始時刻を保存しているため、画面を閉じたりリロードしても経過時間は正確です。ただし iPhone では、アプリを閉じている間の終了通知は出せません。
        </p>
      </>
    )
  }

  // ---- 終了直後 ----
  if (finished) {
    const t = task(finished.taskId)
    const next = t && t.parentId ? resolveNext(data.tasks.find((p) => p.id === t.parentId)!, data.tasks) : undefined
    return (
      <>
        <TopBar title="記録しました" back="/" />
        <section className="card hero center">
          <div className="huge num accent">{finished.actualMin}</div>
          <div className="muted">分 {finished.kind === 'starter' ? '— 始められました。それが一番難しい部分です。' : '集中しました'}</div>
        </section>
        <div className="stack">
          {t && t.status !== 'done' && (
            <button className="btn primary block lg" onClick={() => actions.setStatus(t.id, 'done').then(() => go('/'))}>
              「{t.title.length > 16 ? t.title.slice(0, 16) + '…' : t.title}」を完了にする
            </button>
          )}
          {t && t.status !== 'done' && (
            <button className="btn block lg" onClick={() => actions.startFocus(t.id, 25, 'focus').then(() => setFinished(null))}>
              続けて25分やる
            </button>
          )}
          {next && next.id !== t?.id && (
            <button className="btn block" onClick={() => actions.startFocus(next.id, 5, 'starter').then(() => setFinished(null))}>
              次の小さな行動「{next.title}」を5分
            </button>
          )}
          <button className="btn ghost block" onClick={() => go('/')}>
            ホームに戻る
          </button>
        </div>
      </>
    )
  }

  // ---- 開始前 ----
  const selected = task(taskId)
  return (
    <>
      <TopBar title="集中タイマー" back="/do" />
      <section className="card">
        <h2>何に集中する？</h2>
        <select className="input" value={taskId ?? ''} onChange={(e) => setTaskId(e.target.value || null)} aria-label="タスク">
          <option value="">タスクなし</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {checkin?.topTaskIds.includes(t.id) ? '★ ' : ''}
              {t.title}
            </option>
          ))}
        </select>
        {selected?.firstStep && <div className="small muted break" style={{ marginTop: 8 }}>最初の5分：{selected.firstStep}</div>}
      </section>
      <section className="card">
        <h2>時間</h2>
        <div className="chips" style={{ marginBottom: 8 }}>
          {PRESETS.map((p) => (
            <Chip key={p} on={min === String(p)} onClick={() => setMin(String(p))}>
              {p}分
            </Chip>
          ))}
        </div>
        <input className={`input${err ? ' err' : ''}`} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} aria-label="集中時間（分）" />
        {err && <div className="err-msg">{err}</div>}
      </section>
      <button className="btn primary block lg" onClick={start}>
        <Icon name="play" size={18} />
        開始
      </button>
    </>
  )
}
