import { useState } from 'react'
import { TaskActions, TaskEditor, TaskRow, TriageList } from '../components/tasks'
import { Icon, Seg, Sheet, TopBar } from '../components/ui'
import { formatShort } from '../lib/date'
import { go } from '../lib/router'
import { useStore } from '../lib/store'
import { isOverdue, unfinishedPast } from '../lib/strict'
import type { Task } from '../lib/types'

type Tab = 'today' | 'all' | 'done'

const hm = (ms: number) => new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

export function Execution() {
  const { data, today } = useStore()
  const [tab, setTab] = useState<Tab>('today')
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Task | null>(null)
  const [triage, setTriage] = useState(false)

  const live = data.tasks.filter((t) => !t.deletedAt)
  const roots = live.filter((t) => !t.parentId || !live.some((p) => p.id === t.parentId))
  const childrenOf = (id: string) => live.filter((t) => t.parentId === id).sort((a, b) => a.createdAt - b.createdAt)
  const checkin = data.checkins.find((c) => c.date === today)
  const mitId = checkin?.mitTaskId
  const open_ = roots.filter((t) => t.status !== 'done')
  const past = unfinishedPast(data.tasks, today)

  const render = (list: Task[]) =>
    list.map((t) => {
      const kids = childrenOf(t.id)
      return (
        <div key={t.id}>
          <TaskRow task={t} mit={t.id === mitId} onOpen={setOpen} />
          {kids.length > 0 && (
            <div className="children">
              <div className="tiny dim">
                分割 {kids.filter((k) => k.status === 'done').length}/{kids.length}
              </div>
              {kids.map((k) => (
                <TaskRow key={k.id} task={k} onOpen={setOpen} />
              ))}
            </div>
          )}
        </div>
      )
    })

  const group = (title: string, list: Task[], note?: string) =>
    list.length > 0 && (
      <section className="card" key={title}>
        <h2>
          <span>{title}</span>
          <span className="meta">{list.length}件</span>
        </h2>
        {note && <div className="small muted" style={{ marginBottom: 6 }}>{note}</div>}
        {render(list)}
      </section>
    )

  const byPriority = (a: Task, b: Task) => ({ high: 0, mid: 1, low: 2 })[a.priority] - ({ high: 0, mid: 1, low: 2 })[b.priority] || a.createdAt - b.createdAt
  const todayList = open_.filter((t) => t.plannedDate === today || t.status === 'doing' || (t.dueDate != null && t.dueDate <= today)).sort(byPriority)
  const overdue = open_.filter((t) => isOverdue(t, today)).sort(byPriority)
  const upcoming = open_.filter((t) => t.plannedDate && t.plannedDate > today && !isOverdue(t, today)).sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!))
  const someday = open_.filter((t) => !t.plannedDate && !isOverdue(t, today)).sort(byPriority)
  const todayPlanned = open_.filter((t) => t.plannedDate === today && !isOverdue(t, today)).sort(byPriority)
  const done = live.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 50)
  const sessions = data.focusSessions.filter((s) => s.date === today).sort((a, b) => b.startAt - a.startAt)

  return (
    <>
      <TopBar
        title="実行"
        sub="登録より、着手。"
        right={
          <button className="btn primary sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} />
            追加
          </button>
        }
      />
      <div style={{ marginBottom: 12 }}>
        <Seg label="表示" value={tab} onChange={setTab} options={[['today', '今日'], ['all', 'すべて'], ['done', '完了']]} />
      </div>

      {past.length > 0 && tab !== 'done' && (
        <div className="card warn row">
          <span className="grow small">予定日を過ぎた未完了：{past.length}件</span>
          <button className="btn sm" onClick={() => setTriage(true)}>
            仕分ける
          </button>
        </div>
      )}

      {tab === 'today' && (
        <>
          {todayList.length === 0 && (
            <div className="card empty">
              今日やるタスクはありません。
              <br />
              <button className="link" onClick={() => setAdding(true)}>
                タスクを追加
              </button>
            </div>
          )}
          {todayList.length > 0 && (
            <section className="card">
              <h2>
                <span>今日</span>
                <span className="meta">{todayList.length}件</span>
              </h2>
              {render(todayList)}
            </section>
          )}
        </>
      )}

      {tab === 'all' && (
        <>
          {open_.length === 0 && <div className="card empty">未完了のタスクはありません</div>}
          {group('期限切れ', overdue, '期限を過ぎています。今日やる・期限を変える・削除のどれかを選んでください。')}
          {group('今日', todayPlanned)}
          {group('予定あり', upcoming)}
          {group('いつかやる', someday)}
        </>
      )}

      {tab === 'done' && (
        <section className="card">
          <h2>
            <span>完了したタスク</span>
            <span className="meta">直近{done.length}件</span>
          </h2>
          {done.length === 0 ? <div className="empty">まだありません</div> : render(done)}
        </section>
      )}

      <section className="card">
        <h2>
          <span>集中の記録（今日）</span>
          <button className="btn sm" onClick={() => go('/focus')}>
            タスクなしで集中
          </button>
        </h2>
        {sessions.length === 0 ? (
          <div className="empty">まだ記録がありません</div>
        ) : (
          sessions.map((s) => (
            <div className="list-row small" key={s.id}>
              <span className="num muted">
                {hm(s.startAt)}–{s.endedAt ? hm(s.endedAt) : '実行中'}
              </span>
              <span className="grow break">{(s.taskId && data.tasks.find((t) => t.id === s.taskId)?.title) || 'タスクなし'}</span>
              <span className="num">{s.actualMin != null ? `${s.actualMin}分` : s.kind === 'starter' ? '5分スタート' : `${s.plannedMin}分予定`}</span>
            </div>
          ))
        )}
      </section>

      {adding && <TaskEditor defaults={{ plannedDate: tab === 'today' ? today : null }} onClose={() => setAdding(false)} />}
      {open && <TaskActions task={open} onClose={() => setOpen(null)} />}
      {triage && (
        <Sheet title="未完了の仕分け" onClose={() => setTriage(false)}>
          <TriageList tasks={unfinishedPast(data.tasks, today)} allowed={['continue', 'postpone', 'backlog', 'split', 'delete']} contextLabel={`予定日が${formatShort(today)}より前のタスク`} />
        </Sheet>
      )}
    </>
  )
}
