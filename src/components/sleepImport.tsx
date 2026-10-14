import { useState } from 'react'
import { formatJa, formatMin } from '../lib/date'
import { parseSleepText, readClipboard, type ParsedSleep } from '../lib/healthImport'
import { useStore } from '../lib/store'
import { Sheet } from './ui'

/** Apple Watch / ヘルスケアの睡眠を、iPhone ショートカットのクリップボード経由で取り込む */
export function SleepImport({ onImported }: { onImported: (date: string) => void }) {
  const { data, actions } = useStore()
  const [parsed, setParsed] = useState<ParsedSleep | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)

  const check = (text: string) => {
    const r = parseSleepText(text)
    if (r.ok) {
      setParsed(r.value)
      setErr(null)
      setManual(null)
    } else {
      setParsed(null)
      setErr(r.error)
    }
  }
  const fromClipboard = async () => {
    const text = await readClipboard()
    if (text == null) {
      setManual('')
      setErr('クリップボードを読めませんでした。下の欄を長押しして「ペースト」してください')
      return
    }
    check(text)
  }
  const save = async () => {
    if (!parsed) return
    const ok = await actions.upsert('sleepRecords', { date: parsed.date, bedTime: parsed.bedTime, wakeTime: parsed.wakeTime, durationMin: parsed.durationMin, updatedAt: 0 }, 'ヘルスケアの睡眠を記録しました')
    if (ok) {
      onImported(parsed.date)
      setParsed(null)
    }
  }
  const existing = parsed ? data.sleepRecords.find((r) => r.date === parsed.date) : undefined

  return (
    <section className="card">
      <h2>
        <span>Apple Watch の睡眠</span>
        <button className="link" style={{ padding: 0, minHeight: 0 }} onClick={() => setGuide(true)}>
          設定方法
        </button>
      </h2>
      {!parsed && (
        <>
          <div className="small muted" style={{ marginBottom: 10 }}>
            睡眠のショートカットを実行してから、ここをタップ。
          </div>
          <button className="btn block" onClick={fromClipboard}>
            ヘルスケアから取り込む
          </button>
        </>
      )}
      {manual != null && !parsed && (
        <div style={{ marginTop: 10 }}>
          <textarea className="input" value={manual} onChange={(e) => setManual(e.target.value)} onBlur={() => manual.trim() && check(manual)} placeholder="ここにペースト" aria-label="睡眠データを貼り付け" />
          <button className="btn sm block" style={{ marginTop: 8 }} onClick={() => check(manual)} disabled={!manual.trim()}>
            読み取る
          </button>
        </div>
      )}
      {err && <div className="err-msg" role="alert">{err}</div>}
      {parsed && (
        <div className="stack">
          <div className="row between">
            <span className="muted small">{formatJa(parsed.date)}</span>
            <strong className="num">
              {parsed.bedTime} → {parsed.wakeTime}（{formatMin(parsed.durationMin)}）
            </strong>
          </div>
          {existing && (
            <div className="small warn-t">
              この日は {existing.bedTime} → {existing.wakeTime} で記録済みです。上書きします。
            </div>
          )}
          <div className="btns">
            <button className="btn" onClick={() => setParsed(null)}>
              やめる
            </button>
            <button className="btn primary" onClick={save}>
              {existing ? '上書きして記録' : '記録する'}
            </button>
          </div>
        </div>
      )}
      {guide && <ShortcutGuide onClose={() => setGuide(false)} />}
    </section>
  )
}

function ShortcutGuide({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="ショートカットの作り方" onClose={onClose}>
      <div className="small stack">
        <p className="muted">
          Web アプリはヘルスケアを直接読めないため、iPhone の「ショートカット」アプリで睡眠時刻をコピーし、LIFE OS に貼り付けます。最初に1回だけ作れば、以降は実行するだけです。
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }} className="stack">
          <li>
            ショートカットアプリ →「＋」で新規作成（名前は自由）
          </li>
          <li>
            <strong>「ヘルスケアサンプルを検索」</strong>を追加（「記録」ではない方）
            <ul style={{ paddingLeft: 16, margin: '4px 0 0' }}>
              <li>種類 が次と等しい：睡眠</li>
              <li>開始日 が次の過去の期間内：1 日</li>
              <li>値 が次と等しくない：ベッドにいる</li>
              <li>値 が次と等しくない：覚醒</li>
              <li>並び順序：開始日 ／ 順序：古い順 ／ 制限：オフ</li>
            </ul>
          </li>
          <li>
            <strong>「リストから項目を取得」</strong>（検索欄に「項目」）→ 入力を検索結果の<strong>開始日</strong>、<strong>最初の項目</strong>にする
          </li>
          <li>
            3 を長押しして複製 → 入力を<strong>終了日</strong>、<strong>最後の項目</strong>に変える
          </li>
          <li>
            <strong>「テキスト」</strong>→ 欄をタップ →「変数を選択」で 3 のアクションをタップ → 改行 → 同じく 4 をタップ（青いボタンが2行並べば OK）
          </li>
          <li>
            <strong>「クリップボードにコピー」</strong>を追加
          </li>
          <li>起きてから実行し、LIFE OS の「ヘルスケアから取り込む」をタップ</li>
        </ol>
        <p className="muted">
          初回はヘルスケアへのアクセス許可と、LIFE OS の「ペーストを許可」が求められます。「オートメーション → 睡眠 → 起床」で「すぐに実行」にすると、朝はアプリでタップするだけになります。寝る前に実行すると「過去1日」に昨夜の睡眠が入らず、空になることがあります。
        </p>
        <p className="dim tiny">
          就寝＝最初の睡眠の開始、起床＝最後の睡眠の終了。夜中に起きていた時間も睡眠時間に含みます。iOS のバージョンにより項目名が少し異なる場合があります。
        </p>
      </div>
    </Sheet>
  )
}
