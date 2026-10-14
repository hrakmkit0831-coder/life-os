import { useEffect, useState } from 'react'
import { HabitEditor, HabitToday, habitsForDate } from '../components/habits'
import { TaskActions, TaskRow, TriageList } from '../components/tasks'
import { Chip, Icon, Progress, Sheet, TopBar } from '../components/ui'
import { diffDays, formatClock, formatJa, formatMin, logicalDate } from '../lib/date'
import { candidates, hasOpenChildren } from '../lib/planner'
import { go } from '../lib/router'
import { useStore } from '../lib/store'
import { CAUSE_LABELS, type Task } from '../lib/types'
import { remainingMs } from '../lib/timer'
import { repeatedCauses, resetSignal, unfinishedPast } from '../lib/strict'
import { parseTitle } from '../lib/validate'

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms)
    const on = () => setNow(Date.now())
    document.addEventListener('visibilitychange', on)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', on)
    }
  }, [ms])
  return now
}

/** 分割済みタスクは次に着手すべき子タスクに置き換える */
export function resolveNext(task: Task, all: Task[]): Task {
  if (!hasOpenChildren(task, all)) return task
  return all.filter((t) => t.parentId === task.id && !t.deletedAt && t.status !== 'done').sort((a, b) => a.createdAt - b.createdAt)[0]
}

export function Home() {
  const { data, today, settings, actions } = useStore()
  const now = useNow(1000)
  const [open, setOpen] = useState<Task | null>(null)
  const [triage, setTriage] = useState(false)
  const [habitNew, setHabitNew] = useState(false)

  const checkin = data.checkins.find((c) => c.date === today)
  const review = data.reviews.find((r) => r.date === today)
  const tasksById = new Map(data.tasks.map((t) => [t.id, t]))
  const top = (checkin?.topTaskIds ?? []).map((id) => tasksById.get(id)).filter((t): t is Task => !!t && !t.deletedAt)
  const mit = checkin?.mitTaskId ? tasksById.get(checkin.mitTaskId) : undefined
  const ordered = mit && !mit.deletedAt ? [mit, ...top.filter((t) => t.id !== mit.id)] : top
  const nextTop = ordered.find((t) => t.status !== 'done')
  const next = nextTop ? resolveNext(nextTop, data.tasks) : undefined
  const doneTop = top.filter((t) => t.status === 'done').length

  const habits = habitsForDate(data.habits, today)
  const habitDone = habits.filter((h) => data.habitLogs.some((l) => l.key === `${h.id}|${today}` && l.done)).length
  const focusMin = data.focusSessions.filter((s) => s.date === today && s.actualMin != null).reduce((a, s) => a + (s.actualMin ?? 0), 0)
  const running = data.focusSessions.find((s) => s.status === 'running' || s.status === 'paused')
  const past = unfinishedPast(data.tasks, today)
  const reset = resetSignal(data.tasks, data.checkins, today)
  const repeated = settings.strictMode ? repeatedCauses(data.reviews, today) : []
  const hour = new Date(now).getHours()
  const evening = hour >= 18 || hour < settings.dayStartHour
  const hasData = data.tasks.length + data.checkins.length + data.expenseRecords.length > 0
  const backupStale = hasData && (!settings.lastExportAt || diffDays(today, logicalDate(settings.lastExportAt, settings.dayStartHour)) >= 14)

  const start = async (task: Task, min: number, kind: 'focus' | 'starter') => {
    if (await actions.startFocus(task.id, min, kind)) go('/focus')
  }

  return (
    <>
      <TopBar
        title={formatJa(today)}
        sub={checkin ? `チェックイン済み・エネルギー${{ low: '低', mid: '普通', high: '高' }[checkin.energy]}` : '未チェックイン'}
        right={
          <div className="row">
            {settings.strictMode && <span className="tag accent">STRICT</span>}
            <a className="icon-btn" href="#/settings" aria-label="設定">
              <Icon name="gear" />
            </a>
          </div>
        }
      />

      {running && (
        <a className="card hero row" href="#/focus" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="grow">
            <div className="eyebrow accent">{running.status === 'paused' ? '一時停止中' : '集中中'}</div>
            <div className="break" style={{ fontWeight: 600 }}>
              {(running.taskId && tasksById.get(running.taskId)?.title) || 'タスクなし'}
            </div>
          </div>
          <div className="big num">{formatClock(remainingMs(running, now))}</div>
        </a>
      )}

      {reset.suggested && (
        <div className="card warn">
          <h2>
            <span>立て直しモード</span>
            <Icon name="alert" size={18} />
          </h2>
          <div className="small">{reset.reasons.join('。')}。過去を取り返す必要はありません。今から1つだけ再開しましょう。</div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => go('/reset')}>
            立て直しを始める
          </button>
        </div>
      )}

      {!reset.suggested && past.length > 0 && (
        <div className={`card ${settings.strictMode ? 'warn' : ''}`}>
          <h2>
            <span>未完了の仕分け</span>
            <span className="meta">{past.length}件</span>
          </h2>
          <div className="small muted">予定日を過ぎたタスクは自動で今日に持ち越しません。今日やる・延期・分割・削除を選んでください。</div>
          <button className="btn block" style={{ marginTop: 10 }} onClick={() => setTriage(true)}>
            仕分ける
          </button>
        </div>
      )}

      {!checkin || !checkin.mitTaskId ? (
        <QuickMit />
      ) : next ? (
        <section className="card hero" aria-label="次にやること">
          <div className="eyebrow accent">次にやること</div>
          <div className="big" style={{ margin: '6px 0 4px' }}>
            {next.title}
          </div>
          {next.id !== nextTop?.id && <div className="small muted break">「{nextTop?.title}」の一部</div>}
          <div className="small muted break" style={{ marginBottom: 12 }}>
            {next.firstStep ? `最初の5分：${next.firstStep}` : '最初の5分：必要な物・ファイルを開く'}
          </div>
          <div className="btns">
            <button className="btn primary lg" onClick={() => start(next, 5, 'starter')} disabled={!!running}>
              <Icon name="play" size={18} />
              5分だけ始める
            </button>
            <button className="btn lg" onClick={() => go(`/focus?task=${next.id}`)} disabled={!!running}>
              集中する
            </button>
          </div>
          <button className="link" onClick={() => setOpen(next)}>
            このタスクの操作（完了・延期・分割）
          </button>
        </section>
      ) : (
        <section className="card hero">
          <div className="eyebrow accent">今日の重要タスク：完了</div>
          <div className="big" style={{ margin: '6px 0' }}>
            {doneTop}件すべて完了しました
          </div>
          <div className="small muted">{habits.length > habitDone ? `残りの習慣が${habits.length - habitDone}件あります。` : ''}夜は2分の振り返りで明日の1つを決めましょう。</div>
          <div className="btns" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => go('/do')}>
              他のタスク
            </button>
            <button className="btn primary" onClick={() => go('/review')}>
              振り返る
            </button>
          </div>
        </section>
      )}

      {checkin && top.length > 0 && (
        <section className="card">
          <h2>
            <span>今日の重要タスク</span>
            <a className="meta" href="#/checkin" style={{ color: 'var(--accent)' }}>
              計画を変更
            </a>
          </h2>
          {ordered.map((t) => (
            <TaskRow key={t.id} task={t} mit={t.id === checkin.mitTaskId} onOpen={setOpen} />
          ))}
        </section>
      )}

      <section className="card">
        <h2>今日の進捗</h2>
        <div className="stats">
          <div className="stat">
            <div className="v">
              {doneTop}/{top.length}
            </div>
            <div className="k">重要タスク</div>
          </div>
          <div className="stat">
            <div className="v">
              {habitDone}/{habits.length}
            </div>
            <div className="k">習慣</div>
          </div>
          <div className="stat">
            <div className="v">{formatMin(focusMin)}</div>
            <div className="k">集中</div>
          </div>
        </div>
        {top.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Progress value={doneTop / top.length} />
          </div>
        )}
      </section>

      <section className="card">
        <h2>
          <span>今日の習慣</span>
          <button className="link" style={{ padding: 0, minHeight: 0 }} onClick={() => setHabitNew(true)}>
            ＋追加
          </button>
        </h2>
        {habits.length ? <HabitToday date={today} /> : <div className="empty">今日の習慣はありません</div>}
      </section>

      {repeated.length > 0 && (
        <section className="card warn">
          <h2>繰り返している原因</h2>
          {repeated.slice(0, 2).map((r) => (
            <div key={r.cause} className="small" style={{ marginBottom: 8 }}>
              <strong>{CAUSE_LABELS[r.cause]}</strong>：直近14日の振り返り{r.reviewCount}回中{r.count}回
              <div className="muted">対策：{r.measures[0]}</div>
            </div>
          ))}
        </section>
      )}

      <section className={`card${evening && !review ? ' hero' : ''}`}>
        <h2>
          <span>夜の振り返り</span>
          <span className="meta">{review ? '記録済み' : '約2分'}</span>
        </h2>
        {review ? (
          <div className="small muted break">明日の改善：{review.improvement || '（未記入）'}</div>
        ) : (
          <div className="small muted">できたこと・できなかった原因・明日の改善を1つだけ決めます。</div>
        )}
        <button className={`btn block${evening && !review ? ' primary' : ''}`} style={{ marginTop: 10 }} onClick={() => go('/review')}>
          {review ? '振り返りを見る・直す' : '振り返る'}
        </button>
      </section>

      {backupStale && (
        <a className="card row small" href="#/settings" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="grow muted">
            {settings.lastExportAt ? '最後のバックアップから14日以上経っています。' : 'まだバックアップがありません。'}データはこの端末内にだけ保存されています。
          </span>
          <Icon name="right" />
        </a>
      )}

      {triage && (
        <Sheet title="未完了の仕分け" onClose={() => setTriage(false)}>
          <TriageList tasks={unfinishedPast(data.tasks, today)} allowed={['continue', 'postpone', 'backlog', 'split', 'delete']} />
        </Sheet>
      )}
      {open && <TaskActions task={open} onClose={() => setOpen(null)} />}
      {habitNew && <HabitEditor onClose={() => setHabitNew(false)} />}
    </>
  )
}

/** チェックイン前でも、その場で最重要タスクを決められる */
function QuickMit() {
  const { data, today, settings, actions } = useStore()
  const [title, setTitle] = useState('')
  const [est, setEst] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const checkin = data.checkins.find((c) => c.date === today)
  const cands = candidates(data.tasks, today).slice(0, 4)

  const decide = async (taskId: string) => {
    await actions.saveCheckin({
      date: today,
      energy: checkin?.energy ?? 'mid',
      mitTaskId: taskId,
      topTaskIds: [taskId, ...(checkin?.topTaskIds ?? []).filter((id) => id !== taskId)].slice(0, 3),
      notDoing: checkin?.notDoing ?? '',
      constraints: checkin?.constraints ?? '',
      availableMin: checkin?.availableMin ?? null,
    })
  }
  const create = async () => {
    const t = parseTitle(title)
    if (!t.ok) return setErr(t.error)
    if (settings.strictMode && est == null) return setErr('Strict Mode：推定時間を選んでください')
    const task = await actions.addTask({ title: t.value, plannedDate: today, priority: 'high', estimateMin: est })
    if (task) await decide(task.id)
  }

  return (
    <section className="card hero" aria-label="最重要タスクを決める">
      <div className="eyebrow accent">今日の最重要タスク</div>
      <div className="big phrase" style={{ margin: '6px 0 10px' }}>
        今日これだけは終わらせる、<wbr />を1つ決める
      </div>
      <input className={`input${err ? ' err' : ''}`} value={title} onChange={(e) => { setTitle(e.target.value); setErr(null) }} placeholder="例：企画書の見出しを5つ書く" aria-label="最重要タスク" enterKeyHint="done" />
      <div className="chips" style={{ margin: '8px 0' }}>
        {[15, 25, 45, 60, 90].map((m) => (
          <Chip key={m} on={est === m} onClick={() => setEst(est === m ? null : m)}>
            {m}分
          </Chip>
        ))}
      </div>
      {err && <div className="err-msg">{err}</div>}
      <button className="btn primary block lg" onClick={create} disabled={!title.trim()}>
        これに決める
      </button>
      {cands.length > 0 && (
        <>
          <div className="small muted" style={{ margin: '14px 0 6px' }}>
            既存のタスクから選ぶ
          </div>
          <div className="stack">
            {cands.map((t) => (
              <button key={t.id} className="btn block" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => decide(t.id)}>
                <span className="break">{t.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => go('/checkin')}>
        朝のチェックインで計画を立てる（1分）
      </button>
    </section>
  )
}
