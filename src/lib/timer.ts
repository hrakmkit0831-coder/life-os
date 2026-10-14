// 集中タイマー。開始時刻と目標終了時刻を保存し、表示のたびに現在時刻から再計算する。
// → リロード・スリープ・タブ切替があっても経過時間がずれない。
import type { FocusKind, FocusSession, ISODate } from './types'

export function createSession(p: {
  id: string
  now: number
  plannedMin: number
  taskId: string | null
  kind: FocusKind
  date: ISODate
}): FocusSession {
  return {
    id: p.id,
    taskId: p.taskId,
    kind: p.kind,
    date: p.date,
    startAt: p.now,
    plannedMin: p.plannedMin,
    plannedEndAt: p.now + p.plannedMin * 60000,
    pausedAt: null,
    pausedTotalMs: 0,
    endedAt: null,
    actualMin: null,
    status: 'running',
  }
}

export function remainingMs(s: FocusSession, now: number): number {
  const ref = s.status === 'paused' && s.pausedAt ? s.pausedAt : now
  return Math.max(0, s.plannedEndAt - ref)
}

export function elapsedMs(s: FocusSession, now: number): number {
  const end = s.endedAt ?? (s.status === 'paused' && s.pausedAt ? s.pausedAt : now)
  return Math.max(0, end - s.startAt - s.pausedTotalMs)
}

export function isTimeUp(s: FocusSession, now: number): boolean {
  return s.status === 'running' && now >= s.plannedEndAt
}

export function pause(s: FocusSession, now: number): FocusSession {
  if (s.status !== 'running') return s
  return { ...s, status: 'paused', pausedAt: Math.min(now, s.plannedEndAt) }
}

export function resume(s: FocusSession, now: number): FocusSession {
  if (s.status !== 'paused' || s.pausedAt == null) return s
  const pausedFor = now - s.pausedAt
  return { ...s, status: 'running', pausedAt: null, pausedTotalMs: s.pausedTotalMs + pausedFor, plannedEndAt: s.plannedEndAt + pausedFor }
}

/** 終了。実績は目標時間を上限とする（放置して戻ってきた時間を作業時間に数えないため） */
export function finish(s: FocusSession, now: number, status: 'completed' | 'stopped'): FocusSession {
  let t = s
  if (t.status === 'paused') t = resume(t, now)
  const effectiveEnd = Math.min(now, t.plannedEndAt)
  const ms = Math.max(0, effectiveEnd - t.startAt - t.pausedTotalMs)
  const actualMin = Math.min(t.plannedMin, Math.round((ms / 60000) * 10) / 10)
  return { ...t, status, endedAt: effectiveEnd, actualMin }
}
