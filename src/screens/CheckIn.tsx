import { useEffect, useState } from 'react'
import { TaskEditor, TaskMeta } from '../components/tasks'
import { Chip, Field, Seg, TopBar } from '../components/ui'
import { formatJa, formatMin } from '../lib/date'
import { buildPlan, candidates, CAPACITY_RATIO, ENERGY_RULES, MAX_TOP, UNKNOWN_ESTIMATE } from '../lib/planner'
import { go } from '../lib/router'
import { useStore } from '../lib/store'
import type { Energy, Task } from '../lib/types'
import { parseTitle } from '../lib/validate'

const HOURS = [1, 2, 4, 6, 8]

export function CheckIn() {
  const { data, today, settings, actions } = useStore()
  const existing = data.checkins.find((c) => c.date === today)
  const [energy, setEnergy] = useState<Energy>(existing?.energy ?? 'mid')
  const [available, setAvailable] = useState<number | null>(existing?.availableMin ?? null)
  const [mitId, setMitId] = useState<string | null>(existing?.mitTaskId ?? null)
  const [topIds, setTopIds] = useState<string[]>(existing?.topTaskIds ?? [])
  const [notDoing, setNotDoing] = useState(existing?.notDoing ?? '')
  const [constraints, setConstraints] = useState(existing?.constraints ?? '')
  const [touched, setTouched] = useState(!!existing)
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const cands = candidates(data.tasks, today)
  // 既に今日の計画に入っているタスクも候補に含める
  const candIds = new Set(cands.map((t) => t.id))
  const extra = topIds.map((id) => data.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t && !candIds.has(t.id) && !t.deletedAt)
  const pool = [...extra, ...cands]

  const plan = buildPlan({ energy, availableMin: available, tasks: data.tasks, today, mitTaskId: mitId })

  // 手で選び直すまでは、エネルギーと使える時間から自動で提案を反映
  useEffect(() => {
    if (touched) return
    setMitId(plan.mitTaskId)
    setTopIds(plan.topTaskIds)
  }, [energy, available, data.tasks.length, touched])

  const rule = ENERGY_RULES[energy]
  const selected = topIds.map((id) => data.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t)
  const plannedMin = selected.reduce((s, t) => s + (t.estimateMin ?? UNKNOWN_ESTIMATE), 0)
  const capacity = Math.round((available ?? rule.defaultAvailableMin) * CAPACITY_RATIO)

  const toggle = (id: string) => {
    setTouched(true)
    if (topIds.includes(id)) {
      setTopIds(topIds.filter((x) => x !== id))
      if (mitId === id) setMitId(null)
    } else if (topIds.length < MAX_TOP) {
      setTopIds([...topIds, id])
      if (!mitId) setMitId(id)
    }
  }
  const makeMit = (id: string) => {
    setTouched(true)
    setMitId(id)
    if (!topIds.includes(id)) setTopIds(topIds.length < MAX_TOP ? [id, ...topIds] : [id, ...topIds.slice(0, MAX_TOP - 1)])
  }
  const addNew = async () => {
    const t = parseTitle(newTitle)
    if (!t.ok) return
    const task = await actions.addTask({ title: t.value, plannedDate: today, priority: 'high' })
    if (task) {
      setNewTitle('')
      setTouched(true)
      if (topIds.length < MAX_TOP) setTopIds([...topIds, task.id])
      if (!mitId) setMitId(task.id)
      setEditing(task) // 推定時間と最初の5分をその場で決める
    }
  }

  const save = async () => {
    const e: string[] = []
    if (!mitId) e.push('最重要タスクを1つ決めてください')
    if (topIds.length > MAX_TOP) e.push(`重要タスクは最大${MAX_TOP}件です`)
    if (settings.strictMode) {
      for (const t of selected) if (t.estimateMin == null) e.push(`「${t.title}」の推定時間を入れてください`)
      const mit = selected.find((t) => t.id === mitId)
      if (mit && !mit.firstStep.trim()) e.push(`最重要タスク「${mit.title}」の最初の5分を書いてください`)
    }
    setErrors(e)
    if (e.length) return window.scrollTo(0, 0)
    const ok = await actions.saveCheckin({ date: today, energy, mitTaskId: mitId, topTaskIds: topIds, notDoing: notDoing.trim(), constraints: constraints.trim(), availableMin: available })
    if (ok) go('/')
  }

  return (
    <>
      <TopBar title="朝のチェックイン" sub={formatJa(today)} back="/" />
      {errors.length > 0 && (
        <div className="card danger small" role="alert">
          {errors.map((x) => (
            <div key={x}>・{x}</div>
          ))}
        </div>
      )}

      <section className="card">
        <h2>1. 今日のエネルギー</h2>
        <Seg label="今日のエネルギー" value={energy} onChange={setEnergy} options={[['low', '低い'], ['mid', '普通'], ['high', '高い']]} />
        <div className="small muted" style={{ marginTop: 8 }}>
          {energy === 'low' ? '重要タスクは1件に絞ります。最初の5分に着手できれば十分な前進です。' : energy === 'mid' ? '重要タスクは2件までを推奨します。' : '重要タスクは3件まで。最重要を最初に片付けましょう。'}
        </div>
      </section>

      <section className="card">
        <h2>2. 今日使える時間（任意）</h2>
        <div className="chips">
          {HOURS.map((h) => (
            <Chip key={h} on={available === h * 60} onClick={() => setAvailable(available === h * 60 ? null : h * 60)}>
              {h}時間
            </Chip>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          未選択なら{formatMin(rule.defaultAvailableMin)}として計算。中断や移動を見込んで、その{Math.round(CAPACITY_RATIO * 10)}割（約{formatMin(capacity)}）だけを計画に使います。
        </div>
        <Field label="予定や制約（任意）">
          <input className="input" value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="例：14時から打ち合わせ" />
        </Field>
      </section>

      <section className="card">
        <h2>
          <span>3. 最重要タスクと重要タスク</span>
          <span className="meta num">
            {topIds.length}/{MAX_TOP}
          </span>
        </h2>
        <div className="small muted" style={{ marginBottom: 8 }}>
          ★＝最重要（1つ）。チェック＝今日やる重要タスク（最大{MAX_TOP}件）。
        </div>
        {pool.length === 0 && <div className="empty">候補がありません。下で新しく追加してください。</div>}
        {pool.map((t) => {
          const on = topIds.includes(t.id)
          return (
            <div key={t.id} className="task">
              <button className="check" role="checkbox" aria-checked={on} aria-label={`${t.title}を今日の重要タスクにする`} onClick={() => toggle(t.id)} disabled={!on && topIds.length >= MAX_TOP}>
                {on && '✓'}
              </button>
              <div className="body" onClick={() => setEditing(t)}>
                <div className="title">{t.title}</div>
                <TaskMeta task={t} today={today} mit={t.id === mitId} />
                {settings.strictMode && on && t.estimateMin == null && <div className="tiny danger-t">推定時間が未設定（タップして入力）</div>}
              </div>
              <button className="icon-btn" aria-label={`${t.title}を最重要にする`} aria-pressed={t.id === mitId} onClick={() => makeMit(t.id)} style={t.id === mitId ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
                ★
              </button>
            </div>
          )
        })}
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input grow" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="新しいタスクを追加" aria-label="新しいタスク" enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && addNew()} />
          <button className="btn" onClick={addNew} disabled={!newTitle.trim()}>
            追加
          </button>
        </div>
      </section>

      <section className="card">
        <h2>計画の見積もり</h2>
        <div className="row between small">
          <span className="muted">重要タスクの推定合計</span>
          <strong className={`num ${plannedMin > capacity ? 'danger-t' : ''}`}>
            {formatMin(plannedMin)} / {formatMin(capacity)}
          </strong>
        </div>
        <div className="row between small">
          <span className="muted">集中ブロックの目安</span>
          <strong>{rule.block}分 × {Math.max(1, Math.ceil(plannedMin / rule.block))}回</strong>
        </div>
        {plannedMin > capacity && <div className="small danger-t" style={{ marginTop: 6 }}>使える時間を超えています。1件減らすか、分割して今日の分だけにしてください。</div>}
        {topIds.length > rule.maxTop && <div className="small warn-t" style={{ marginTop: 6 }}>エネルギー「{{ low: '低い', mid: '普通', high: '高い' }[energy]}」の推奨は{rule.maxTop}件までです。</div>}
        {[...plan.warnings.filter(() => mitId === plan.mitTaskId), ...plan.tips].map((w) => (
          <div key={w} className="small muted" style={{ marginTop: 6 }}>
            ・{w}
          </div>
        ))}
        {touched && (
          <button className="link" onClick={() => setTouched(false)}>
            提案に戻す
          </button>
        )}
      </section>

      <section className="card">
        <h2>4. 今日やらないこと</h2>
        <input className="input" value={notDoing} onChange={(e) => setNotDoing(e.target.value)} placeholder="例：寝る前のYouTube／新しい企画を考える" aria-label="今日やらないこと" />
      </section>

      <button className="btn primary block lg" onClick={save}>
        {existing ? '計画を更新する' : 'この計画で始める'}
      </button>
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
