import type { DailyCheckIn, Task } from '../../src/lib/types'

export const at = (date: string, hh = 12, mm = 0) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, hh, mm).getTime()
}

let n = 0
export function task(p: Partial<Task> = {}): Task {
  n++
  return {
    id: p.id ?? `t${n}`,
    title: `タスク${n}`,
    priority: 'mid',
    dueDate: null,
    estimateMin: 30,
    firstStep: '',
    status: 'todo',
    plannedDate: null,
    parentId: null,
    postponeCount: 0,
    createdAt: n,
    updatedAt: n,
    startedAt: null,
    completedAt: null,
    deletedAt: null,
    ...p,
  }
}

export function checkin(date: string, topTaskIds: string[], mitTaskId = topTaskIds[0] ?? null): DailyCheckIn {
  return { date, energy: 'mid', mitTaskId, topTaskIds, topTitles: {}, notDoing: '', constraints: '', availableMin: null, createdAt: 0, updatedAt: 0 }
}
