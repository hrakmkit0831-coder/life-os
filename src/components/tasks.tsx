import { useState } from 'react'
import { addDays, formatMin, formatShort } from '../lib/date'
import { suggestBreakdown } from '../lib/planner'
import { go } from '../lib/router'
import { useStore, type NewTask } from '../lib/store'
import { isOverdue, TRIAGE_LABEL, type TriageAction } from '../lib/strict'
import type { ISODate, Priority, Task, TaskStatus } from '../lib/types'
import { parseMinutes, parseTitle } from '../lib/validate'
import { Check, Chip, Field, Icon, Seg, Sheet } from './ui'

export const PRIORITY_LABEL: Record<Priority, string> = { high: '高', mid: '中', low: '低' }
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: '未着手', doing: '進行中', done: '完了', postponed: '延期' }

export function TaskMeta({ task, today, mit }: { task: Task; today: ISODate; mit?: boolean }) {
  return (
    <div className="meta">
      {mit && <span className="tag accent">最重要</span>}
      {task.status === 'doing' && <span className="tag warn">進行中</span>}
      {task.status === 'postponed' && <span className="tag">延期{task.postponeCount > 1 ? `×${task.postponeCount}` : ''}</span>}
      {isOverdue(task, today) && <span className="tag danger">期限切れ {formatShort(task.dueDate!)}</span>}
      {task.dueDate && !isOverdue(task, today) && <span>期限 {task.dueDate === today ? '今日' : formatShort(task.dueDate)}</span>}
      {task.estimateMin != null && <span>{formatMin(task.estimateMin)}</span>}
      <span>優先度 {PRIORITY_LABEL[task.priority]}</span>
    </div>
  )
}

export function TaskRow({ task, mit, onOpen }: { task: Task; mit?: boolean; onOpen: (t: Task) => void }) {
  const { actions, today } = useStore()
  const done = task.status === 'done'
  return (
    <div className={`task${done ? ' done' : ''}`}>
      <Check checked={done} label={`${task.title}を${done ? '未完了に戻す' : '完了にする'}`} onToggle={() => actions.setStatus(task.id, done ? 'todo' : 'done')} />
      <div className="body" onClick={() => onOpen(task)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(task)}>
        <div className="title">{task.title}</div>
        <TaskMeta task={task} today={today} mit={mit} />
        {!done && task.firstStep && <div className="small muted break">最初の5分：{task.firstStep}</div>}
      </div>
    </div>
  )
}

const EST_PRESETS = [5, 15, 25, 45, 60, 90]

export function TaskEditor({ task, defaults, onClose, onSaved }: { task?: Task; defaults?: Partial<NewTask>; onClose: () => void; onSaved?: (t: Task) => void }) {
  const { actions, today, settings } = useStore()
  const [title, setTitle] = useState(task?.title ?? defaults?.title ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? defaults?.priority ?? 'mid')
  const [planned, setPlanned] = useState<ISODate | ''>(task ? (task.plannedDate ?? '') : (defaults?.plannedDate ?? ''))
  const [due, setDue] = useState<ISODate | ''>(task?.dueDate ?? defaults?.dueDate ?? '')
  const [est, setEst] = useState(String(task?.estimateMin ?? defaults?.estimateMin ?? ''))
  const [firstStep, setFirstStep] = useState(task?.firstStep ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const breakdown = suggestBreakdown({ title, estimateMin: Number(est) || null, firstStep })

  const save = async () => {
    const e: Record<string, string> = {}
    const t = parseTitle(title)
    const m = parseMinutes(est, 1440)
    if (!t.ok) e.title = t.error
    if (!m.ok) e.est = m.error
    if (due && planned && due < planned) e.due = '期限が実行予定日より前になっています'
    if (settings.strictMode && planned === today && m.ok && m.value == null) e.est = 'Strict Mode：今日やるタスクには推定時間が必要です'
    setErrors(e)
    if (Object.keys(e).length || !t.ok || !m.ok) return
    const fields = { title: t.value, priority, plannedDate: planned || null, dueDate: due || null, estimateMin: m.value, firstStep: firstStep.trim() }
    if (task) {
      const next: Task = { ...task, ...fields, status, completedAt: status === 'done' ? (task.completedAt ?? Date.now()) : null }
      if (await actions.updateTask(next)) {
        onSaved?.(next)
        onClose()
      }
    } else {
      const created = await actions.addTask({ ...fields, parentId: defaults?.parentId ?? null })
      if (created) {
        onSaved?.(created)
        onClose()
      }
    }
  }

  return (
    <Sheet title={task ? 'タスクを編集' : 'タスクを追加'} onClose={onClose}>
      <div className="stack">
        <Field label="タスク名（完了したと判断できる書き方で）" error={errors.title}>
          <input className={`input${errors.title ? ' err' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：企画書の見出しを5つ書く" autoFocus={!task} enterKeyHint="done" />
        </Field>
        <Field label="最初の5分でやること">
          <input className="input" value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="例：ファイルを開いてタイトルだけ書く" />
        </Field>
        <div>
          <span className="lbl small muted" style={{ fontWeight: 600 }}>
            推定所要時間（分）
          </span>
          <div className="chips" style={{ margin: '6px 0' }}>
            {EST_PRESETS.map((p) => (
              <Chip key={p} on={est === String(p)} onClick={() => setEst(String(p))}>
                {p}分
              </Chip>
            ))}
          </div>
          <input className={`input${errors.est ? ' err' : ''}`} inputMode="numeric" value={est} onChange={(e) => setEst(e.target.value)} placeholder="自由入力（分）" aria-label="推定所要時間（分）" />
          {errors.est && <div className="err-msg">{errors.est}</div>}
        </div>
        {breakdown.tooBig && title.trim() && (
          <div className="card warn small" style={{ marginBottom: 0 }}>
            <strong>大きすぎるかもしれません</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {breakdown.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="muted" style={{ marginTop: 4 }}>保存後に「分割」で小さな行動に分けられます。</div>
          </div>
        )}
        <Field label="優先順位">
          <Seg label="優先順位" value={priority} onChange={setPriority} options={[['high', '高'], ['mid', '中'], ['low', '低']]} />
        </Field>
        <div>
          <span className="lbl small muted" style={{ fontWeight: 600 }}>
            いつやるか
          </span>
          <div className="chips" style={{ margin: '6px 0' }}>
            <Chip on={planned === today} onClick={() => setPlanned(today)}>
              今日
            </Chip>
            <Chip on={planned === addDays(today, 1)} onClick={() => setPlanned(addDays(today, 1))}>
              明日
            </Chip>
            <Chip on={planned === ''} onClick={() => setPlanned('')}>
              いつか
            </Chip>
          </div>
          <input className="input" type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} aria-label="実行予定日" />
        </div>
        <Field label="期限（任意）" error={errors.due}>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        {task && (
          <Field label="状態">
            <Seg label="状態" value={status} onChange={setStatus} options={[['todo', '未着手'], ['doing', '進行中'], ['done', '完了'], ['postponed', '延期']]} />
          </Field>
        )}
        <button className="btn primary block lg" onClick={save}>
          保存
        </button>
      </div>
    </Sheet>
  )
}

/** タスクをタップしたときの操作シート */
export function TaskActions({ task, onClose }: { task: Task; onClose: () => void }) {
  const { actions, data, today } = useStore()
  const [mode, setMode] = useState<'menu' | 'edit' | 'split' | 'postpone'>('menu')
  const [date, setDate] = useState(addDays(today, 1))
  const live = data.tasks.find((t) => t.id === task.id) ?? task
  const bd = suggestBreakdown(live)
  const children = data.tasks.filter((t) => t.parentId === live.id && !t.deletedAt)
  const isMit = data.checkins.find((c) => c.date === today)?.mitTaskId === live.id

  if (mode === 'edit') return <TaskEditor task={live} onClose={onClose} />
  if (mode === 'split') return <BreakdownSheet task={live} onClose={onClose} />

  const start = async (min: number, kind: 'focus' | 'starter') => {
    if (await actions.startFocus(live.id, min, kind)) {
      onClose()
      go('/focus')
    }
  }
  const done = live.status === 'done'

  return (
    <Sheet title="タスク" onClose={onClose}>
      <div className="stack">
        <div>
          <div className="big">{live.title}</div>
          <TaskMeta task={live} today={today} mit={isMit} />
        </div>
        {live.firstStep && (
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="eyebrow">最初の5分</div>
            <div className="break">{live.firstStep}</div>
          </div>
        )}
        {!done && bd.tooBig && children.length === 0 && (
          <div className="card warn small" style={{ marginBottom: 0 }}>
            {bd.reasons[0]}。
            <button className="link" onClick={() => setMode('split')}>
              小さな行動に分割する
            </button>
          </div>
        )}
        {!done && (
          <div className="btns">
            <button className="btn primary lg" onClick={() => start(5, 'starter')}>
              <Icon name="play" size={18} />
              5分だけ始める
            </button>
            <button className="btn lg" onClick={() => { onClose(); go(`/focus?task=${live.id}`) }}>
              集中タイマー
            </button>
          </div>
        )}
        <button className="btn block" onClick={() => actions.setStatus(live.id, done ? 'todo' : 'done').then((ok) => ok && onClose())}>
          {done ? '未完了に戻す' : '完了にする'}
        </button>
        {mode === 'postpone' ? (
          <div className="card" style={{ marginBottom: 0 }}>
            <Field label="いつに延期する？">
              <input className="input" type="date" value={date} min={addDays(today, 1)} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="btns" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setMode('menu')}>
                戻る
              </button>
              <button className="btn primary" disabled={!date || date <= today} onClick={() => actions.triage(live.id, 'postpone', date).then((ok) => ok && onClose())}>
                延期する
              </button>
            </div>
          </div>
        ) : (
          !done && (
            <div className="btns three">
              <button className="btn sm" onClick={() => actions.triage(live.id, 'postpone', addDays(today, 1)).then((ok) => ok && onClose())}>
                明日へ
              </button>
              <button className="btn sm" onClick={() => setMode('postpone')}>
                日付を選ぶ
              </button>
              <button className="btn sm" onClick={() => actions.triage(live.id, 'backlog').then((ok) => ok && onClose())}>
                いつか
              </button>
            </div>
          )
        )}
        <div className="btns">
          <button className="btn" onClick={() => setMode('edit')}>
            編集
          </button>
          <button className="btn" onClick={() => setMode('split')} disabled={done}>
            分割
          </button>
        </div>
        <button
          className="btn danger block"
          onClick={() => {
            if (confirm(`「${live.title}」を削除しますか？${children.length ? `\n分割した${children.length}件も削除されます。` : ''}`)) actions.deleteTask(live.id).then((ok) => ok && onClose())
          }}
        >
          削除
        </button>
      </div>
    </Sheet>
  )
}

/** 分割シート。ルールベースの提案を初期値にして編集できる */
export function BreakdownSheet({ task, onClose, onDone }: { task: Task; onClose: () => void; onDone?: () => void }) {
  const { actions, today } = useStore()
  const bd = suggestBreakdown(task)
  const [lines, setLines] = useState<string[]>(bd.steps)
  const [planned, setPlanned] = useState<ISODate | ''>(task.plannedDate && task.plannedDate >= today ? task.plannedDate : today)

  const parse = (s: string) => {
    const m = s.match(/[（(](\d+)分[）)]\s*$/)
    return { title: s.replace(/[（(]\d+分[）)]\s*$/, '').trim(), estimateMin: m ? Number(m[1]) : null }
  }
  const valid = lines.map(parse).filter((l) => l.title)

  return (
    <Sheet title="小さな行動に分割" onClose={onClose}>
      <div className="stack">
        <div className="muted small break">「{task.title}」を、1つ30分以内・何をすれば終わりか分かる行動に分けます。（）内の分数は推定時間になります。</div>
        {bd.reasons.length > 0 && (
          <ul className="small warn-t" style={{ margin: 0, paddingLeft: 18 }}>
            {bd.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {lines.map((l, i) => (
          <div className="row" key={i}>
            <span className="dim num" style={{ width: 18 }}>
              {i + 1}
            </span>
            <input className="input grow" value={l} onChange={(e) => setLines(lines.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`手順${i + 1}`} />
            <button className="icon-btn" aria-label={`手順${i + 1}を削除`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
        <button className="btn ghost block" onClick={() => setLines([...lines, ''])}>
          <Icon name="plus" size={18} />
          手順を追加
        </button>
        <Field label="分割したタスクの実行予定日">
          <input className="input" type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} />
        </Field>
        <button
          className="btn primary block lg"
          disabled={valid.length < 2}
          onClick={() => actions.splitTask(task.id, valid, planned || null).then((ok) => ok && (onDone?.(), onClose()))}
        >
          {valid.length}個に分割する
        </button>
        {valid.length < 2 && <div className="small muted center">2つ以上の手順を入力してください</div>}
      </div>
    </Sheet>
  )
}

/** 未完了タスクの仕分け。自動で持ち越さず、1件ずつ次の対応を決める */
export function TriageList({ tasks, allowed, contextLabel, onHandled }: { tasks: Task[]; allowed: TriageAction[]; contextLabel?: string; onHandled?: (id: string) => void }) {
  const { actions, today } = useStore()
  const [splitting, setSplitting] = useState<Task | null>(null)
  const [dating, setDating] = useState<string | null>(null)
  const [date, setDate] = useState(addDays(today, 2))
  const tomorrow = addDays(today, 1)

  if (tasks.length === 0) return <div className="empty">仕分けが必要なタスクはありません</div>

  return (
    <div>
      {contextLabel && <div className="small muted" style={{ marginBottom: 6 }}>{contextLabel}</div>}
      {tasks.map((t) => (
        <div className="list-row" key={t.id} style={{ display: 'block' }}>
          <div className="title break" style={{ fontWeight: 600 }}>
            {t.title}
          </div>
          <TaskMeta task={t} today={today} />
          {t.plannedDate && t.plannedDate < today && <div className="tiny dim">予定日 {formatShort(t.plannedDate)}</div>}
          {dating === t.id ? (
            <div className="row" style={{ marginTop: 8 }}>
              <input className="input grow" type="date" value={date} min={tomorrow} onChange={(e) => setDate(e.target.value)} aria-label="延期先の日付" />
              <button className="btn sm primary" disabled={!date || date <= today} onClick={() => actions.triage(t.id, 'postpone', date).then((ok) => { setDating(null); if (ok) onHandled?.(t.id) })}>
                決定
              </button>
            </div>
          ) : (
            <div className="chips" style={{ marginTop: 8 }}>
              {allowed.map((a) => (
                <button
                  key={a}
                  className={`chip${a === 'delete' ? ' danger-t' : ''}`}
                  onClick={() => {
                    if (a === 'split') setSplitting(t)
                    else if (a === 'postpone') setDating(t.id)
                    else if (a === 'delete') {
                      if (confirm(`「${t.title}」を削除しますか？`)) actions.triage(t.id, 'delete').then((ok) => ok && onHandled?.(t.id))
                    } else actions.triage(t.id, a).then((ok) => ok && onHandled?.(t.id))
                  }}
                >
                  {a === 'postpone' ? '日付を選んで延期' : TRIAGE_LABEL[a]}
                </button>
              ))}
              {allowed.includes('postpone') && (
                <button className="chip" onClick={() => actions.triage(t.id, 'postpone', tomorrow).then((ok) => ok && onHandled?.(t.id))}>
                  明日やる
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {splitting && <BreakdownSheet task={splitting} onClose={() => setSplitting(null)} onDone={() => onHandled?.(splitting.id)} />}
    </div>
  )
}
