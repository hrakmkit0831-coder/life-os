import { useState } from 'react'
import { SleepImport } from '../components/sleepImport'
import { Field, Icon, Seg, TopBar } from '../components/ui'
import { addDays, formatJa, formatMin, formatShort, lastNDays, sleepDuration, startOfMonth, startOfWeek } from '../lib/date'
import { expenseByCategory, expenseTotal } from '../lib/analytics'
import { useStore } from '../lib/store'
import { EXPENSE_CATEGORIES, type ISODate } from '../lib/types'
import { isValidTime, parseAmount, parseMinutes } from '../lib/validate'

type Area = 'rhythm' | 'health' | 'time' | 'money'
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

export function Tracker() {
  const { today, data } = useStore()
  const [area, setArea] = useState<Area>('rhythm')
  const [date, setDate] = useState<ISODate>(today)
  return (
    <>
      <TopBar title="生活" sub="必要なものだけ記録すればOK" />
      <div style={{ marginBottom: 12 }}>
        <Seg label="領域" value={area} onChange={setArea} options={[['rhythm', 'リズム'], ['health', '健康'], ['time', '時間'], ['money', 'お金']]} />
      </div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="icon-btn" aria-label="前の日" onClick={() => setDate(addDays(date, -1))}>
          <Icon name="left" />
        </button>
        <div className="center">
          <div style={{ fontWeight: 700 }}>{formatJa(date)}</div>
          {date !== today && (
            <button className="link" style={{ minHeight: 0, padding: 0 }} onClick={() => setDate(today)}>
              今日に戻る
            </button>
          )}
        </div>
        <button className="icon-btn" aria-label="次の日" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} style={date >= today ? { opacity: 0.3 } : undefined}>
          <Icon name="right" />
        </button>
      </div>
      {area === 'rhythm' && <SleepImport onImported={setDate} />}
      {area === 'rhythm' && <Rhythm key={`${date}|${data.sleepRecords.find((r) => r.date === date)?.updatedAt ?? 0}`} date={date} />}
      {area === 'health' && <Health key={date} date={date} />}
      {area === 'time' && <Time key={date} date={date} />}
      {area === 'money' && <Money key={date} date={date} />}
    </>
  )
}

function Rhythm({ date }: { date: ISODate }) {
  const { data, settings, actions, today } = useStore()
  const rec = data.sleepRecords.find((r) => r.date === date)
  const [bed, setBed] = useState(rec?.bedTime ?? settings.bedTarget)
  const [wake, setWake] = useState(rec?.wakeTime ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const valid = isValidTime(bed) && isValidTime(wake)
  const dur = valid ? sleepDuration(bed, wake) : null

  const save = () => {
    if (!valid) return setErr('就寝時刻と起床時刻を入力してください')
    if (dur! > 16 * 60) return setErr('睡眠時間が16時間を超えています。時刻を確認してください')
    setErr(null)
    actions.upsert('sleepRecords', { date, bedTime: bed, wakeTime: wake, durationMin: dur!, updatedAt: 0 })
  }
  const week = lastNDays(today, 7)
  const map = new Map(data.sleepRecords.map((r) => [r.date, r]))

  return (
    <>
      <section className="card">
        <h2>
          <span>睡眠</span>
          {rec && <span className="meta">記録済み</span>}
        </h2>
        <div className="small muted" style={{ marginBottom: 10 }}>
          起きた日に記録します。就寝が前日の夜でも、そのまま時刻を入れれば日付またぎで計算されます。
        </div>
        <div className="grid2">
          <Field label="就寝時刻">
            <input className="input" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
          </Field>
          <Field label="起床時刻">
            <input className="input" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
          </Field>
        </div>
        <div className="row between" style={{ margin: '12px 0' }}>
          <span className="muted small">睡眠時間</span>
          <strong className={`num ${dur != null && dur < settings.sleepGoalMin ? 'warn-t' : ''}`}>{dur != null ? formatMin(dur) : '—'}</strong>
        </div>
        {err && <div className="err-msg">{err}</div>}
        <button className="btn primary block" onClick={save}>
          {rec ? '更新' : '記録'}
        </button>
        {rec && (
          <button className="link" onClick={() => actions.removeRecord('sleepRecords', date)}>
            この日の睡眠記録を削除
          </button>
        )}
      </section>

      <section className="card">
        <h2>
          <span>生活リズムの目標</span>
          <button className="link" style={{ padding: 0, minHeight: 0 }} onClick={() => setGoalOpen(!goalOpen)}>
            {goalOpen ? '閉じる' : '変更'}
          </button>
        </h2>
        {goalOpen ? <GoalForm onDone={() => setGoalOpen(false)} /> : (
          <div className="small">
            就寝 <strong>{settings.bedTarget}</strong> ／ 起床 <strong>{settings.wakeTarget}</strong> ／ 睡眠 <strong>{formatMin(settings.sleepGoalMin)}</strong>以上
          </div>
        )}
      </section>

      <section className="card">
        <h2>直近7日</h2>
        {week.map((d) => {
          const r = map.get(d)
          return (
            <div className="list-row small" key={d}>
              <span className="num" style={{ width: 44 }}>{formatShort(d)}</span>
              <span className="grow muted num">{r ? `${r.bedTime} → ${r.wakeTime}` : '記録なし'}</span>
              <strong className={`num ${r && r.durationMin < settings.sleepGoalMin ? 'warn-t' : ''}`}>{r ? formatMin(r.durationMin) : ''}</strong>
            </div>
          )
        })}
      </section>
    </>
  )
}

function GoalForm({ onDone }: { onDone: () => void }) {
  const { settings, actions } = useStore()
  const [bed, setBed] = useState(settings.bedTarget)
  const [wake, setWake] = useState(settings.wakeTarget)
  const [hours, setHours] = useState(String(settings.sleepGoalMin / 60))
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    const h = Number(hours)
    if (!isValidTime(bed) || !isValidTime(wake)) return setErr('時刻を入力してください')
    if (!Number.isFinite(h) || h < 4 || h > 12) return setErr('目標睡眠時間は4〜12時間で入力してください')
    if (await actions.updateSettings({ bedTarget: bed, wakeTarget: wake, sleepGoalMin: Math.round(h * 60) }, '目標を更新しました')) onDone()
  }
  return (
    <div className="stack">
      <div className="grid2">
        <Field label="就寝目標">
          <input className="input" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
        </Field>
        <Field label="起床目標">
          <input className="input" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
        </Field>
      </div>
      <Field label="目標睡眠時間（時間）" error={err}>
        <input className="input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
      </Field>
      <button className="btn primary block" onClick={save}>
        目標を保存
      </button>
    </div>
  )
}

function Health({ date }: { date: ISODate }) {
  const { data, actions } = useStore()
  const ex = data.exerciseRecords.find((r) => r.date === date)
  const he = data.healthRecords.find((r) => r.date === date)
  const [exercised, setExercised] = useState<'yes' | 'no'>(ex?.exercised ? 'yes' : 'no')
  const [minutes, setMinutes] = useState(ex?.minutes ? String(ex.minutes) : '')
  const [kind, setKind] = useState(ex?.kind ?? '')
  const [meals, setMeals] = useState(he?.meals ?? '')
  const [cond, setCond] = useState<string>(he?.condition ? String(he.condition) : '')
  const [err, setErr] = useState<string | null>(null)

  const saveEx = () => {
    const m = parseMinutes(minutes, 600)
    if (!m.ok) return setErr(m.error)
    setErr(null)
    actions.upsert('exerciseRecords', { date, exercised: exercised === 'yes', minutes: exercised === 'yes' ? (m.value ?? 0) : 0, kind: kind.trim(), updatedAt: 0 })
  }
  const saveHealth = () => actions.upsert('healthRecords', { date, meals: meals.trim(), condition: cond ? Number(cond) : null, updatedAt: 0 })

  return (
    <>
      <section className="card">
        <h2>
          <span>運動</span>
          {ex && <span className="meta">記録済み</span>}
        </h2>
        <div className="stack">
          <Seg label="運動したか" value={exercised} onChange={setExercised} options={[['yes', 'した'], ['no', 'していない']]} />
          {exercised === 'yes' && (
            <div className="grid2">
              <Field label="時間（分）" error={err}>
                <input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" />
              </Field>
              <Field label="内容（任意）">
                <input className="input" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="散歩" />
              </Field>
            </div>
          )}
          <button className="btn primary block" onClick={saveEx}>
            運動を記録
          </button>
        </div>
      </section>
      <section className="card">
        <h2>
          <span>食事と体調</span>
          {he && <span className="meta">記録済み</span>}
        </h2>
        <div className="stack">
          <Field label="食事（任意・簡単に）">
            <textarea className="input" value={meals} onChange={(e) => setMeals(e.target.value)} placeholder="朝：パン／昼：定食／夜：自炊" />
          </Field>
          <div>
            <span className="small muted" style={{ fontWeight: 600 }}>
              体調・エネルギー（1=悪い 〜 5=良い）
            </span>
            <div style={{ marginTop: 6 }}>
              <Seg label="体調" value={cond} onChange={setCond} options={[['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]} />
            </div>
          </div>
          <button className="btn primary block" onClick={saveHealth}>
            食事・体調を記録
          </button>
        </div>
      </section>
    </>
  )
}

function Time({ date }: { date: ISODate }) {
  const { data, actions } = useStore()
  const tr = data.timeRecords.find((r) => r.date === date)
  const sr = data.screenTimeRecords.find((r) => r.date === date)
  const [study, setStudy] = useState(tr ? String(tr.studyMin) : '')
  const [work, setWork] = useState(tr ? String(tr.workMin) : '')
  const [sns, setSns] = useState(sr ? String(sr.snsMin) : '')
  const [game, setGame] = useState(sr ? String(sr.gameMin) : '')
  const [video, setVideo] = useState(sr ? String(sr.videoMin) : '')
  const [err, setErr] = useState<{ t?: string; s?: string }>({})
  const sessions = data.focusSessions.filter((s) => s.date === date && s.actualMin != null)
  const focusMin = sessions.reduce((a, s) => a + (s.actualMin ?? 0), 0)

  const saveTime = () => {
    const a = parseMinutes(study)
    const b = parseMinutes(work)
    if (!a.ok || !b.ok) return setErr({ t: (!a.ok && a.error) || (!b.ok && b.error) || '' })
    if ((a.value ?? 0) + (b.value ?? 0) > 1440) return setErr({ t: '合計が24時間を超えています' })
    setErr({})
    actions.upsert('timeRecords', { date, studyMin: a.value ?? 0, workMin: b.value ?? 0, updatedAt: 0 })
  }
  const saveScreen = () => {
    const vals = [parseMinutes(sns), parseMinutes(game), parseMinutes(video)]
    const bad = vals.find((v) => !v.ok)
    if (bad && !bad.ok) return setErr({ s: bad.error })
    const [s, g, v] = vals.map((x) => (x.ok ? (x.value ?? 0) : 0))
    if (s + g + v > 1440) return setErr({ s: '合計が24時間を超えています' })
    setErr({})
    actions.upsert('screenTimeRecords', { date, snsMin: s, gameMin: g, videoMin: v, updatedAt: 0 })
  }

  return (
    <>
      <section className="card">
        <h2>
          <span>勉強・仕事</span>
          {tr && <span className="meta">記録済み</span>}
        </h2>
        <div className="grid2">
          <Field label="勉強（分）">
            <input className="input" inputMode="numeric" value={study} onChange={(e) => setStudy(e.target.value)} placeholder="0" />
          </Field>
          <Field label="仕事（分）">
            <input className="input" inputMode="numeric" value={work} onChange={(e) => setWork(e.target.value)} placeholder="0" />
          </Field>
        </div>
        {err.t && <div className="err-msg">{err.t}</div>}
        <div className="row between small" style={{ margin: '10px 0' }}>
          <span className="muted">集中セッション（自動）</span>
          <strong className="num">
            {sessions.length}回・{formatMin(focusMin)}
          </strong>
        </div>
        <button className="btn primary block" onClick={saveTime}>
          記録
        </button>
      </section>
      <section className="card">
        <h2>
          <span>SNS・ゲーム・動画</span>
          {sr && <span className="meta">記録済み</span>}
        </h2>
        <div className="small muted" style={{ marginBottom: 10 }}>
          手入力です。iPhone の「設定 → スクリーンタイム → すべてのアクティビティを確認」で見た値を入れてください。Web アプリからは自動取得できません。
        </div>
        <div className="grid3">
          <Field label="SNS（分）">
            <input className="input" inputMode="numeric" value={sns} onChange={(e) => setSns(e.target.value)} placeholder="0" />
          </Field>
          <Field label="ゲーム（分）">
            <input className="input" inputMode="numeric" value={game} onChange={(e) => setGame(e.target.value)} placeholder="0" />
          </Field>
          <Field label="動画（分）">
            <input className="input" inputMode="numeric" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="0" />
          </Field>
        </div>
        {err.s && <div className="err-msg">{err.s}</div>}
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={saveScreen}>
          記録
        </button>
      </section>
    </>
  )
}

function Money({ date }: { date: ISODate }) {
  const { data, actions } = useStore()
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState(EXPENSE_CATEGORIES[0])
  const [memo, setMemo] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const list = data.expenseRecords.filter((e) => e.date === date).sort((a, b) => b.createdAt - a.createdAt)
  const weekFrom = startOfWeek(date)
  const monthFrom = startOfMonth(date)
  const dayTotal = expenseTotal(data, date, date)
  const weekTotal = expenseTotal(data, weekFrom, addDays(weekFrom, 6))
  const monthEnd = addDays(startOfMonth(addDays(monthFrom, 32)), -1)
  const monthTotal = expenseTotal(data, monthFrom, monthEnd)
  const cats = expenseByCategory(data, monthFrom, monthEnd)

  const add = async () => {
    const a = parseAmount(amount)
    if (!a.ok) return setErr(a.error)
    setErr(null)
    if (await actions.addExpense({ date, amount: a.value, category: cat, memo: memo.trim().slice(0, 100) })) {
      setAmount('')
      setMemo('')
    }
  }

  return (
    <>
      <section className="card">
        <h2>支出を記録</h2>
        <div className="stack">
          <Field label="金額（円）" error={err}>
            <input className={`input${err ? ' err' : ''}`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1200" />
          </Field>
          <div className="chips">
            {EXPENSE_CATEGORIES.map((c) => (
              <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <Field label="メモ（任意）">
            <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="コンビニ" />
          </Field>
          <button className="btn primary block" onClick={add}>
            追加
          </button>
        </div>
      </section>

      <section className="card">
        <h2>合計</h2>
        <div className="stats">
          <div className="stat">
            <div className="v" data-testid="total-day">{yen(dayTotal)}</div>
            <div className="k">この日</div>
          </div>
          <div className="stat">
            <div className="v" data-testid="total-week">{yen(weekTotal)}</div>
            <div className="k">週（月曜〜）</div>
          </div>
          <div className="stat">
            <div className="v" data-testid="total-month">{yen(monthTotal)}</div>
            <div className="k">{Number(monthFrom.slice(5, 7))}月</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>
          <span>この日の支出</span>
          <span className="meta">{list.length}件</span>
        </h2>
        {list.length === 0 && <div className="empty">記録はありません</div>}
        {list.map((e) => (
          <div className="list-row" key={e.id}>
            <span className="tag">{e.category}</span>
            <span className="grow small muted break">{e.memo}</span>
            <strong className="num">{yen(e.amount)}</strong>
            <button className="icon-btn" aria-label={`${yen(e.amount)}の支出を削除`} onClick={() => confirm(`${e.category} ${yen(e.amount)} を削除しますか？`) && actions.removeRecord('expenseRecords', e.id)}>
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
      </section>

      {cats.length > 0 && (
        <section className="card">
          <h2>{Number(monthFrom.slice(5, 7))}月のカテゴリ別</h2>
          {cats.map(([c, v]) => (
            <div key={c} style={{ marginBottom: 8 }}>
              <div className="row between small">
                <span>{c}</span>
                <span className="num">{yen(v)}</span>
              </div>
              <div className="bar">
                <i style={{ width: `${(v / cats[0][1]) * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
