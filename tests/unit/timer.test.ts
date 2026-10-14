import { describe, expect, it } from 'vitest'
import { createSession, elapsedMs, finish, isTimeUp, pause, remainingMs, resume } from '../../src/lib/timer'

const T0 = 1_800_000_000_000
const MIN = 60_000
const s0 = () => createSession({ id: 'f', now: T0, plannedMin: 25, taskId: null, kind: 'focus', date: '2026-10-15' })

describe('集中タイマー', () => {
  it('保存した開始時刻から残り時間を再計算する（リロード後も正確）', () => {
    const reloaded = JSON.parse(JSON.stringify(s0())) // IndexedDB から読み直した想定
    expect(remainingMs(reloaded, T0 + 10 * MIN)).toBe(15 * MIN)
    expect(elapsedMs(reloaded, T0 + 10 * MIN)).toBe(10 * MIN)
    expect(isTimeUp(reloaded, T0 + 25 * MIN)).toBe(true)
    expect(remainingMs(reloaded, T0 + 99 * MIN)).toBe(0)
  })
  it('一時停止中は残り時間が減らず、再開すると終了時刻が後ろにずれる', () => {
    let s = pause(s0(), T0 + 5 * MIN)
    expect(remainingMs(s, T0 + 30 * MIN)).toBe(20 * MIN)
    s = resume(s, T0 + 10 * MIN)
    expect(s.plannedEndAt).toBe(T0 + 30 * MIN)
    expect(remainingMs(s, T0 + 20 * MIN)).toBe(10 * MIN)
    expect(elapsedMs(s, T0 + 20 * MIN)).toBe(15 * MIN)
  })
  it('実績は目標時間が上限（放置した時間を数えない）', () => {
    const f = finish(s0(), T0 + 3 * 60 * MIN, 'completed')
    expect(f.actualMin).toBe(25)
    expect(f.endedAt).toBe(T0 + 25 * MIN)
  })
  it('途中終了は経過分だけ記録', () => {
    const f = finish(s0(), T0 + 7.5 * MIN, 'stopped')
    expect(f.actualMin).toBe(7.5)
    expect(f.status).toBe('stopped')
  })
  it('一時停止のまま終了しても停止時間は数えない', () => {
    const s = pause(s0(), T0 + 4 * MIN)
    expect(finish(s, T0 + 60 * MIN, 'stopped').actualMin).toBe(4)
  })
})
