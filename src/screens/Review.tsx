import { useState } from 'react'
import { TriageList } from '../components/tasks'
import { Chip, Field, Seg, TopBar } from '../components/ui'
import { addDays, formatJa, formatMin, logicalDate } from '../lib/date'
import { go } from '../lib/router'
import { useStore } from '../lib/store'
import { COUNTERMEASURES, repeatedCauses } from '../lib/strict'
import { CAUSE_LABELS, type Cause, type ISODate, type Task } from '../lib/types'

const CAUSES = Object.keys(CAUSE_LABELS) as Cause[]

export function Review() {
  const { data, today } = useStore()
  const yesterday = addDays(today, -1)
  const yMissing = !data.reviews.some((r) => r.date === yesterday) && data.checkins.some((c) => c.date === yesterday)
  const [date, setDate] = useState<ISODate>(today)
  return (
    <>
      <TopBar title="振り返り" sub="2分で、明日の1つを決める" />
      {(yMissing || date === yesterday) && (
        <div style={{ marginBottom: 12 }}>
          <Seg label="対象日" value={date} onChange={setDate} options={[[today, '今日'], [yesterday, `昨日${yMissing ? '（未記録）' : ''}`]]} />
        </div>
      )}
      <ReviewForm key={date} date={date} />
    </>
  )
}

function ReviewForm({ date }: { date: ISODate }) {
  const { data, settings, actions, today } = useStore()
  const existing = data.reviews.find((r) => r.date === date)
  const checkin = data.checkins.find((c) => c.date === date)
  const byId = new Map(data.tasks.map((t) => [t.id, t]))
  const doneOn = (t: Task) => t.status === 'done' && t.completedAt != null && logicalDate(t.completedAt, settings.dayStartHour) <= date
  const top = (checkin?.topTaskIds ?? []).map((id) => byId.get(id)).filter((t): t is Task => !!t)
  const mit = checkin?.mitTaskId ? byId.get(checkin.mitTaskId) : undefined
  const doneTop = top.filter(doneOn)
  const completedToday = data.tasks.filter((t) => !t.deletedAt && t.completedAt != null && logicalDate(t.completedAt, settings.dayStartHour) === date)
  const unfinished = data.tasks.filter((t) => !t.deletedAt && t.status !== 'done' && t.plannedDate != null && t.plannedDate <= date && !data.tasks.some((c) => c.parentId === t.id && !c.deletedAt && c.status !== 'done'))
  const plannedMin = top.reduce((s, t) => s + (t.estimateMin ?? 0), 0)
  const focusMin = data.focusSessions.filter((s) => s.date === date).reduce((s, x) => s + (x.actualMin ?? 0), 0)
  const missedTop = top.filter((t) => !doneOn(t) && !t.deletedAt)

  const [mitDone, setMitDone] = useState<'yes' | 'no' | ''>(existing ? (existing.mitDone == null ? '' : existing.mitDone ? 'yes' : 'no') : mit ? (doneOn(mit) ? 'yes' : 'no') : '')
  const [achieved, setAchieved] = useState(existing?.achieved ?? '')
  const [missed, setMissed] = useState(existing?.missed ?? '')
  const [causes, setCauses] = useState<Cause[]>(existing?.causes ?? [])
  const [note, setNote] = useState(existing?.note ?? '')
  const [showNote, setShowNote] = useState(!!existing?.note)
  const [improvement, setImprovement] = useState(existing?.improvement ?? '')
  const [errors, setErrors] = useState<string[]>([])
  const repeated = repeatedCauses(data.reviews, today)

  const suggestions = [...new Set(causes.flatMap((c) => COUNTERMEASURES[c].slice(0, 2)))].slice(0, 4)

  const save = async () => {
    const e: string[] = []
    if (!improvement.trim()) e.push('明日改善することを1つ書いてください')
    if (settings.strictMode) {
      if (unfinished.length > 0) e.push(`未完了タスク${unfinished.length}件の次の対応を選んでください`)
      if (missedTop.length > 0 && causes.length === 0) e.push('できなかった主な原因を選んでください')
    }
    setErrors(e)
    if (e.length) return window.scrollTo(0, 0)
    const ok = await actions.saveReview({
      date,
      mitDone: mitDone === '' ? null : mitDone === 'yes',
      achieved: achieved.trim(),
      missed: missed.trim(),
      causes,
      note: note.trim(),
      improvement: improvement.trim(),
      plannedTopCount: top.length,
      doneTopCount: doneTop.length,
      plannedMin,
      actualFocusMin: Math.round(focusMin),
    })
    if (ok) go('/')
  }

  return (
    <>
      {errors.length > 0 && (
        <div className="card danger small" role="alert">
          {errors.map((x) => (
            <div key={x}>・{x}</div>
          ))}
        </div>
      )}

      <section className="card">
        <h2>
          <span>{formatJa(date)}の事実</span>
          {existing && <span className="meta">記録済み</span>}
        </h2>
        {checkin ? (
          <div className="stats">
            <div className="stat">
              <div className="v">
                {doneTop.length}/{top.length}
              </div>
              <div className="k">重要タスク</div>
            </div>
            <div className="stat">
              <div className="v">{formatMin(plannedMin)}</div>
              <div className="k">計画（推定）</div>
            </div>
            <div className="stat">
              <div className="v">{formatMin(focusMin)}</div>
              <div className="k">集中の実績</div>
            </div>
          </div>
        ) : (
          <div className="small muted">この日はチェックインがありません。計画がない日も、振り返りは記録できます。</div>
        )}
      </section>

      <section className="card">
        <h2>1. 最重要タスクは完了した？</h2>
        {mit ? <div className="small muted break" style={{ marginBottom: 8 }}>{mit.title}</div> : <div className="small muted" style={{ marginBottom: 8 }}>最重要タスクは未設定でした</div>}
        <Seg label="最重要タスクの完了" value={mitDone} onChange={setMitDone} options={[['yes', '完了'], ['no', '未完了'], ['', '該当なし']]} />
      </section>

      <section className="card">
        <h2>2. できたこと</h2>
        {completedToday.length > 0 && (
          <ul className="small" style={{ margin: '0 0 8px', paddingLeft: 18 }}>
            {completedToday.map((t) => (
              <li key={t.id} className="break">{t.title}</li>
            ))}
          </ul>
        )}
        <input className="input" value={achieved} onChange={(e) => setAchieved(e.target.value)} placeholder="他にできたこと（任意）" aria-label="できたこと" />
      </section>

      <section className="card">
        <h2>3. できなかったこと</h2>
        {missedTop.length > 0 && (
          <ul className="small" style={{ margin: '0 0 8px', paddingLeft: 18 }}>
            {missedTop.map((t) => (
              <li key={t.id} className="break">{t.title}</li>
            ))}
          </ul>
        )}
        <input className="input" value={missed} onChange={(e) => setMissed(e.target.value)} placeholder="他にできなかったこと（任意）" aria-label="できなかったこと" />
      </section>

      <section className="card">
        <h2>4. 主な原因（複数可）</h2>
        <div className="chips">
          {CAUSES.map((c) => (
            <Chip key={c} on={causes.includes(c)} onClick={() => {
              const next = causes.includes(c) ? causes.filter((x) => x !== c) : [...causes, c]
              setCauses(next)
              if (c === 'other' && next.includes('other')) setShowNote(true)
            }}>
              {CAUSE_LABELS[c]}
            </Chip>
          ))}
        </div>
        {showNote ? (
          <div style={{ marginTop: 10 }}>
            <Field label="メモ（任意・短く）">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            </Field>
          </div>
        ) : (
          <button className="link" onClick={() => setShowNote(true)}>
            メモを追加
          </button>
        )}
        {repeated.filter((r) => causes.includes(r.cause)).map((r) => (
          <div key={r.cause} className="small warn-t" style={{ marginTop: 8 }}>
            「{CAUSE_LABELS[r.cause]}」は直近14日で{r.count}回目です。下の対策から1つ選ぶのがおすすめです。
          </div>
        ))}
      </section>

      {unfinished.length > 0 && (
        <section className="card">
          <h2>
            <span>未完了タスクの次の対応</span>
            <span className="meta">{unfinished.length}件</span>
          </h2>
          <div className="small muted" style={{ marginBottom: 6 }}>
            自動では持ち越しません。明日やる・延期・いつか・分割・削除から選んでください。
          </div>
          <TriageList tasks={unfinished} allowed={['postpone', 'backlog', 'split', 'delete']} />
        </section>
      )}

      <section className="card">
        <h2>5. 明日、何を1つ改善する？</h2>
        {suggestions.length > 0 && (
          <div className="chips" style={{ marginBottom: 8 }}>
            {suggestions.map((s) => (
              <Chip key={s} on={improvement === s} onClick={() => setImprovement(s)}>
                {s}
              </Chip>
            ))}
          </div>
        )}
        <input className="input" value={improvement} onChange={(e) => setImprovement(e.target.value)} placeholder="例：作業中はスマホを別の部屋に置く" aria-label="明日の改善" />
      </section>

      <button className="btn primary block lg" onClick={save}>
        {existing ? '振り返りを更新' : '振り返りを保存'}
      </button>
    </>
  )
}
