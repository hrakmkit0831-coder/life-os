import { useState } from 'react'
import { BreakdownSheet, TriageList } from '../components/tasks'
import { Field, Icon, TopBar } from '../components/ui'
import { suggestBreakdown } from '../lib/planner'
import { go } from '../lib/router'
import { useStore } from '../lib/store'
import { openTasks } from '../lib/strict'
import type { Task } from '../lib/types'
import { parseTitle } from '../lib/validate'
import { resolveNext } from './Home'

/**
 * 立て直しモード：未完了を仕分け → 今日の1つを決める → 5分の行動にする → 始める。
 * 失った日数を取り戻す計画は作らない。
 */
export function Reset() {
  const { data, today, actions } = useStore()
  const [step, setStep] = useState(0)
  const [handled, setHandled] = useState<Set<string>>(new Set())
  const [chosen, setChosen] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [action, setAction] = useState('')
  const [splitting, setSplitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const open = openTasks(data.tasks)
  const pending = open.filter((t) => !handled.has(t.id))
  const todays = open.filter((t) => t.plannedDate === today)
  const chosenTask = chosen ? data.tasks.find((t) => t.id === chosen) : undefined
  const target = chosenTask ? resolveNext(chosenTask, data.tasks) : undefined

  const handle = (id: string) => setHandled((s) => new Set(s).add(id))
  const restToBacklog = async () => {
    for (const t of pending) if (await actions.triage(t.id, 'backlog')) handle(t.id)
  }

  const pick = async () => {
    if (chosen) return setStep(2)
    const t = parseTitle(newTitle)
    if (!t.ok) return setErr(t.error)
    const task = await actions.addTask({ title: t.value, plannedDate: today, priority: 'high', estimateMin: 5 })
    if (task) {
      setChosen(task.id)
      setStep(2)
    }
  }

  const begin = async () => {
    if (!target) return
    const a = action.trim() || suggestBreakdown(target).starter
    if (a !== target.firstStep) await actions.updateTask({ ...target, firstStep: a }, '最初の5分を設定しました')
    await actions.saveCheckin({ date: today, energy: 'low', mitTaskId: chosen, topTaskIds: [chosen!], notDoing: '過去の遅れを取り戻そうとすること', constraints: '', availableMin: null })
    if (await actions.startFocus(target.id, 5, 'starter')) go('/focus')
  }

  return (
    <>
      <TopBar title="立て直し" sub="過去を取り返すのではなく、今から再開する" back="/" />
      <div className="steps" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <>
          <section className="card">
            <h2>1. 今ある未完了を仕分ける</h2>
            <div className="small muted">
              全部やろうとしなくて大丈夫です。今日やるもの以外は「延期」か「いつか」で外して、頭の中を空けます。
            </div>
          </section>
          {pending.length > 0 ? (
            <section className="card">
              <h2>
                <span>残り</span>
                <span className="meta">{pending.length}件</span>
              </h2>
              <TriageList tasks={pending} allowed={['continue', 'postpone', 'backlog', 'split', 'delete']} onHandled={handle} />
              <button className="btn block" style={{ marginTop: 10 }} onClick={restToBacklog}>
                残り{pending.length}件をすべて「いつか」に移す
              </button>
            </section>
          ) : (
            <div className="card empty">未完了タスクの仕分けが終わりました</div>
          )}
          <button className="btn primary block lg" disabled={pending.length > 0} onClick={() => setStep(1)}>
            次へ：今日の1つを決める
          </button>
        </>
      )}

      {step === 1 && (
        <section className="card">
          <h2>2. 今日必要なことを1つだけ決める</h2>
          {todays.length > 0 && (
            <div className="stack" style={{ marginBottom: 12 }}>
              {todays.map((t: Task) => (
                <button key={t.id} className="btn block" aria-pressed={chosen === t.id} style={{ justifyContent: 'flex-start', textAlign: 'left', ...(chosen === t.id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }} onClick={() => { setChosen(t.id); setNewTitle('') }}>
                  <span className="break">{t.title}</span>
                </button>
              ))}
            </div>
          )}
          <Field label={todays.length ? 'または新しく書く' : '今日やる1つ'} error={err}>
            <input className="input" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); setChosen(null); setErr(null) }} placeholder="例：部屋の床にある物を拾う" />
          </Field>
          <button className="btn primary block lg" style={{ marginTop: 12 }} disabled={!chosen && !newTitle.trim()} onClick={pick}>
            次へ：5分の行動にする
          </button>
        </section>
      )}

      {step === 2 && target && (
        <section className="card">
          <h2>3. 5分以内に始められる行動にする</h2>
          <div className="small muted break" style={{ marginBottom: 10 }}>
            「{target.title}」の最初の5分で、具体的に何をしますか？
          </div>
          <input className="input" value={action} onChange={(e) => setAction(e.target.value)} placeholder={target.firstStep || suggestBreakdown(target).starter} aria-label="最初の5分の行動" />
          <div className="small dim" style={{ marginTop: 6 }}>空欄なら「{target.firstStep || suggestBreakdown(target).starter}」で始めます。</div>
          {suggestBreakdown(target).tooBig && target.id === chosen && (
            <button className="btn block" style={{ marginTop: 10 }} onClick={() => setSplitting(true)}>
              小さな手順に分割してから始める
            </button>
          )}
          <button className="btn primary block lg" style={{ marginTop: 12 }} onClick={() => setStep(3)}>
            次へ
          </button>
        </section>
      )}

      {step === 3 && target && (
        <section className="card hero center">
          <div className="eyebrow accent">4. 始める</div>
          <div className="big" style={{ margin: '10px 0 4px' }}>
            {action.trim() || target.firstStep || suggestBreakdown(target).starter}
          </div>
          <div className="small muted" style={{ marginBottom: 16 }}>
            5分だけ。終わったら次の小さな行動を提案します。
          </div>
          <button className="btn primary block lg" onClick={begin}>
            <Icon name="play" size={18} />
            5分だけ始める
          </button>
        </section>
      )}

      {splitting && chosenTask && <BreakdownSheet task={chosenTask} onClose={() => setSplitting(false)} onDone={() => setAction('')} />}
    </>
  )
}
