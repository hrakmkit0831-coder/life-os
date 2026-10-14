import { useState } from 'react'
import { BarChart, Progress, Seg, TopBar } from '../components/ui'
import { avg, causeCounts, expenseSeries, focusMinByDate, habitRatio, insights, pct, seriesBy, topTaskDays } from '../lib/analytics'
import { formatMin, formatShort, lastNDays } from '../lib/date'
import { useStore } from '../lib/store'
import { CAUSE_LABELS } from '../lib/types'

const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`

function NoData({ what }: { what: string }) {
  return <div className="empty">{what}の記録がまだありません。記録するとここに表示されます。</div>
}

export function Analytics() {
  const { data, today, settings } = useStore()
  const [range, setRange] = useState<'7' | '30'>('7')
  const n = Number(range)
  const dates = lastNDays(today, n)
  const labels = dates.map(formatShort)

  const tops = topTaskDays(data, dates, settings.dayStartHour)
  const topTotal = { done: tops.reduce((s, d) => s + d.done, 0), total: tops.reduce((s, d) => s + d.planned, 0) }
  const mitDays = tops.filter((d) => d.mitDone != null)
  const mit = { done: mitDays.filter((d) => d.mitDone).length, total: mitDays.length }
  const habit = habitRatio(data, dates, settings.dayStartHour)
  const sleep = seriesBy(data.sleepRecords, dates, (r) => r.durationMin)
  const sleepVals = sleep.filter((v): v is number => v != null)
  const study = seriesBy(data.timeRecords, dates, (r) => r.studyMin)
  const work = seriesBy(data.timeRecords, dates, (r) => r.workMin)
  const focus = focusMinByDate(data, dates)
  const screen = seriesBy(data.screenTimeRecords, dates, (r) => r.snsMin + r.gameMin + r.videoMin)
  const screenVals = screen.filter((v): v is number => v != null)
  const expenses = expenseSeries(data, dates)
  const expenseSum = expenses.reduce((a, b) => a + b, 0)
  const causes = causeCounts(data, dates)
  const ins = insights(data, today, n, settings.dayStartHour, settings.sleepGoalMin)
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
  const recorded = (xs: (number | null)[]) => xs.filter((v) => v != null).length

  return (
    <>
      <TopBar title="分析" sub={`${formatShort(dates[0])}〜${formatShort(today)}`} />
      <div style={{ marginBottom: 12 }}>
        <Seg label="期間" value={range} onChange={setRange} options={[['7', '直近7日'], ['30', '直近30日']]} />
      </div>

      <section className="card">
        <h2>重要タスクの完了率</h2>
        {topTotal.total === 0 ? (
          <NoData what="チェックイン" />
        ) : (
          <>
            <div className="row between">
              <span className="huge num" style={{ fontSize: 44 }}>{pct(topTotal)}</span>
              <span className="small muted" style={{ textAlign: 'right' }}>
                チェックインで確定した重要タスク
                <br />
                <strong className="num" style={{ color: 'var(--text)' }}>{topTotal.total}件中 {topTotal.done}件</strong>をその日のうちに完了
              </span>
            </div>
            <div style={{ margin: '10px 0' }}>
              <Progress value={topTotal.done / topTotal.total} />
            </div>
            <div className="small muted">
              最重要タスク：{mit.total}日中 {mit.done}日完了 ／ チェックインした日：{tops.length}/{n}日
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>習慣の実施率</h2>
        {habit.total === 0 ? (
          <NoData what="習慣" />
        ) : (
          <>
            <div className="row between">
              <strong className="big num">{pct(habit)}</strong>
              <span className="small muted">予定された {habit.total}回中 {habit.done}回 実施</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <Progress value={habit.done / habit.total} />
            </div>
          </>
        )}
      </section>

      {ins.length > 0 && (
        <section className="card">
          <h2>データから見える傾向</h2>
          {ins.map((i) => (
            <div key={i.text} style={{ marginBottom: 10 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className={`tag ${i.kind === 'trend' ? 'accent' : ''}`}>{i.kind === 'trend' ? '傾向' : '仮説'}</span>
                <span className="small" style={{ fontWeight: 600 }}>{i.text}</span>
              </div>
              <div className="tiny muted" style={{ marginTop: 2 }}>根拠：{i.basis}</div>
            </div>
          ))}
          <div className="tiny dim">「仮説」は記録日数が少ないため断定できないものです。相関であり、原因とは限りません。</div>
        </section>
      )}

      <section className="card">
        <h2>
          <span>睡眠時間</span>
          {sleepVals.length > 0 && <span className="meta">平均 {formatMin(avg(sleepVals))}（{sleepVals.length}日分）</span>}
        </h2>
        {sleepVals.length === 0 ? <NoData what="睡眠" /> : <BarChart labels={labels} values={sleep} format={formatMin} goal={settings.sleepGoalMin} goalLabel={`目標 ${formatMin(settings.sleepGoalMin)}`} />}
      </section>

      <section className="card">
        <h2>
          <span>勉強・仕事・集中</span>
        </h2>
        {recorded(study) + recorded(work) === 0 && sum(focus) === 0 ? (
          <NoData what="勉強・仕事" />
        ) : (
          <>
            <div className="stats" style={{ marginBottom: 10 }}>
              <div className="stat">
                <div className="v">{formatMin(sum(study))}</div>
                <div className="k">勉強（{recorded(study)}日分）</div>
              </div>
              <div className="stat">
                <div className="v">{formatMin(sum(work))}</div>
                <div className="k">仕事（{recorded(work)}日分）</div>
              </div>
              <div className="stat">
                <div className="v">{formatMin(sum(focus))}</div>
                <div className="k">集中タイマー</div>
              </div>
            </div>
            <div className="small muted" style={{ marginBottom: 4 }}>勉強＋仕事（分／日）</div>
            <BarChart labels={labels} values={dates.map((_, i) => (study[i] == null && work[i] == null ? null : (study[i] ?? 0) + (work[i] ?? 0)))} format={formatMin} />
          </>
        )}
      </section>

      <section className="card">
        <h2>
          <span>SNS・ゲーム・動画</span>
          {screenVals.length > 0 && <span className="meta">平均 {formatMin(avg(screenVals))}／日</span>}
        </h2>
        {screenVals.length === 0 ? <NoData what="スマホ・ゲーム時間（手入力）" /> : <BarChart labels={labels} values={screen} format={formatMin} />}
      </section>

      <section className="card">
        <h2>
          <span>支出</span>
          {expenseSum > 0 && <span className="meta">合計 {yen(expenseSum)}</span>}
        </h2>
        {expenseSum === 0 ? <NoData what="支出" /> : <BarChart labels={labels} values={expenses} format={yen} />}
      </section>

      <section className="card">
        <h2>
          <span>先延ばしの原因</span>
          {causes.reviews > 0 && <span className="meta">振り返り{causes.reviews}回</span>}
        </h2>
        {causes.counts.length === 0 ? (
          <NoData what="振り返りの原因" />
        ) : (
          causes.counts.map(([c, k]) => (
            <div key={c} style={{ marginBottom: 8 }}>
              <div className="row between small">
                <span>{CAUSE_LABELS[c]}</span>
                <span className="num">
                  {k}回 / {causes.reviews}回
                </span>
              </div>
              <Progress value={k / causes.reviews} />
            </div>
          ))
        )}
      </section>
    </>
  )
}
