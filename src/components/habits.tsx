import { useState } from 'react'
import { lastNDays, weekday } from '../lib/date'
import { useStore } from '../lib/store'
import type { Habit, ISODate } from '../lib/types'
import { parseTitle } from '../lib/validate'
import { Field, Icon, Sheet } from './ui'

const WD = ['日', '月', '火', '水', '木', '金', '土']

export function habitsForDate(habits: Habit[], date: ISODate): Habit[] {
  return habits.filter((h) => !h.archived && h.weekdays.includes(weekday(date))).sort((a, b) => a.order - b.order)
}

export function HabitToday({ date }: { date: ISODate }) {
  const { data, actions } = useStore()
  const list = habitsForDate(data.habits, date)
  const done = new Set(data.habitLogs.filter((l) => l.done && l.date === date).map((l) => l.habitId))
  if (list.length === 0) return null
  return (
    <div className="stack">
      {list.map((h) => (
        <button key={h.id} className="habit" aria-pressed={done.has(h.id)} onClick={() => actions.toggleHabit(h.id, date)}>
          <span className="check" aria-checked={done.has(h.id)} aria-hidden="true">
            {done.has(h.id) && <Icon name="check" size={18} />}
          </span>
          <span className="grow">
            <span style={{ fontWeight: 600, display: 'block' }} className="break">
              {h.name}
            </span>
            {h.minimum && <span className="small muted break">最低ライン：{h.minimum}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

export function HabitEditor({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const { actions } = useStore()
  const [name, setName] = useState(habit?.name ?? '')
  const [minimum, setMinimum] = useState(habit?.minimum ?? '')
  const [days, setDays] = useState<number[]>(habit?.weekdays ?? [0, 1, 2, 3, 4, 5, 6])
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    const t = parseTitle(name, '習慣名')
    if (!t.ok) return setErr(t.error)
    if (days.length === 0) return setErr('実施する曜日を1つ以上選んでください')
    if (await actions.saveHabit({ id: habit?.id, name: t.value, minimum: minimum.trim(), weekdays: [...days].sort() })) onClose()
  }
  return (
    <Sheet title={habit ? '習慣を編集' : '習慣を追加'} onClose={onClose}>
      <div className="stack">
        <Field label="習慣名" error={err}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：筋トレ" />
        </Field>
        <Field label="最低ライン（できない日でもこれだけはやる）">
          <input className="input" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="例：腕立て1回" />
        </Field>
        <div>
          <span className="small muted" style={{ fontWeight: 600 }}>
            実施する曜日
          </span>
          <div className="seg" style={{ marginTop: 6 }}>
            {WD.map((w, i) => (
              <button key={i} type="button" aria-pressed={days.includes(i)} onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i])}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <button className="btn primary block lg" onClick={save}>
          保存
        </button>
        {habit && (
          <div className="btns">
            <button className="btn" onClick={() => actions.saveHabit({ ...habit, archived: !habit.archived }).then((ok) => ok && onClose())}>
              {habit.archived ? '再開する' : 'お休みする'}
            </button>
            <button
              className="btn danger"
              onClick={() => confirm(`「${habit.name}」とこれまでの記録を削除しますか？\n記録を残したい場合は「お休みする」を選んでください。`) && actions.deleteHabit(habit.id).then((ok) => ok && onClose())}
            >
              削除
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/** 習慣の一覧と直近7日の実施状況（連続記録ではなく回数で示す） */
export function HabitManager() {
  const { data, today } = useStore()
  const [editing, setEditing] = useState<Habit | 'new' | null>(null)
  const days = lastNDays(today, 7)
  const done = new Set(data.habitLogs.filter((l) => l.done).map((l) => l.key))
  const sorted = [...data.habits].sort((a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order)
  return (
    <div>
      {sorted.length === 0 && <div className="empty">習慣はまだありません。最初は1つだけ、最低ラインを小さく設定するのがおすすめです。</div>}
      {sorted.map((h) => {
        const sched = days.filter((d) => h.weekdays.includes(weekday(d)))
        const n = sched.filter((d) => done.has(`${h.id}|${d}`)).length
        const total = data.habitLogs.filter((l) => l.habitId === h.id && l.done).length
        return (
          <button key={h.id} className="list-row" style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer', color: 'inherit' }} onClick={() => setEditing(h)}>
            <span className="grow">
              <span style={{ fontWeight: 600 }} className="break">
                {h.name}
              </span>
              {h.archived && <span className="tag" style={{ marginLeft: 6 }}>お休み中</span>}
              <span className="small muted" style={{ display: 'block' }}>
                {h.weekdays.length === 7 ? '毎日' : h.weekdays.map((d) => WD[d]).join('・')}
                {h.minimum && ` ／ 最低ライン：${h.minimum}`}
              </span>
            </span>
            <span className="small muted num" style={{ textAlign: 'right' }}>
              直近7日 {n}/{sched.length}
              <br />
              累計 {total}回
            </span>
          </button>
        )
      })}
      <button className="btn block" style={{ marginTop: 10 }} onClick={() => setEditing('new')}>
        習慣を追加
      </button>
      {editing && <HabitEditor habit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
