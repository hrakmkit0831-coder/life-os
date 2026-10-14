import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clearAll, loadAll, replaceAll, writeOps, type WriteOp } from './db'
import { logicalDate } from './date'
import { applyTriage, type TriageAction } from './strict'
import * as timer from './timer'
import {
  DEFAULT_SETTINGS,
  STORE_KEYS,
  type DailyCheckIn,
  type DailyReview,
  type DataSet,
  type ExpenseRecord,
  type FocusKind,
  type FocusSession,
  type Habit,
  type ISODate,
  type Settings,
  type StoreName,
  type Task,
  type TaskStatus,
} from './types'

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      /* 非セキュアコンテキスト（LAN の http）では使えないため下へ */
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export const emptyData = (): DataSet => ({
  tasks: [],
  habits: [],
  habitLogs: [],
  checkins: [],
  reviews: [],
  focusSessions: [],
  sleepRecords: [],
  exerciseRecords: [],
  healthRecords: [],
  timeRecords: [],
  screenTimeRecords: [],
  expenseRecords: [],
  settings: [{ ...DEFAULT_SETTINGS }],
})

/** 書き込み操作をメモリ上のデータに反映 */
export function applyOps(data: DataSet, ops: WriteOp[]): DataSet {
  const next = { ...data } as Record<StoreName, unknown[]>
  for (const op of ops) {
    const key = STORE_KEYS[op.store]
    let arr = [...(next[op.store] as Record<string, unknown>[])]
    if (op.delete !== undefined) arr = arr.filter((r) => r[key] !== op.delete)
    if (op.put !== undefined) {
      const rec = op.put as Record<string, unknown>
      const i = arr.findIndex((r) => r[key] === rec[key])
      if (i >= 0) arr[i] = rec
      else arr.push(rec)
    }
    next[op.store] = arr
  }
  return next as unknown as DataSet
}

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error'
}

export interface NewTask {
  title: string
  priority?: Task['priority']
  dueDate?: ISODate | null
  estimateMin?: number | null
  firstStep?: string
  plannedDate?: ISODate | null
  parentId?: string | null
}

function useProvideStore() {
  const [data, setData] = useState<DataSet>(emptyData)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [clock, setClock] = useState(() => Date.now())
  const dataRef = useRef(data)
  dataRef.current = data

  const settings: Settings = data.settings[0] ?? DEFAULT_SETTINGS
  const today = logicalDate(clock, settings.dayStartHour)

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 2500)
  }, [])

  // 初回読み込み + 永続ストレージの要求（iOS の自動削除を受けにくくする）
  useEffect(() => {
    loadAll()
      .then((d) => {
        if (!d.settings.length) d.settings = [{ ...DEFAULT_SETTINGS }]
        else d.settings = [{ ...DEFAULT_SETTINGS, ...d.settings[0] }]
        setData(d)
        setReady(true)
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e))
        setReady(true)
      })
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  // 日付の切り替わりを検知（アプリを開いたまま日をまたいでも正しい日付になる）
  useEffect(() => {
    const tick = () => setClock(Date.now())
    const iv = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])

  /** 保存してから画面に反映。失敗したら画面は変えずにエラー表示 */
  const commit = useCallback(
    async (ops: WriteOp[], okMsg?: string): Promise<boolean> => {
      try {
        await writeOps(ops)
        setData((d) => applyOps(d, ops))
        dataRef.current = applyOps(dataRef.current, ops)
        if (okMsg) toast(okMsg)
        return true
      } catch (e) {
        toast(`保存に失敗しました：${e instanceof Error ? e.message : String(e)}`, 'error')
        return false
      }
    },
    [toast],
  )

  const now = () => Date.now()
  const todayNow = () => logicalDate(Date.now(), (dataRef.current.settings[0] ?? DEFAULT_SETTINGS).dayStartHour)

  const actions = useMemo(() => {
    const getTask = (id: string) => dataRef.current.tasks.find((t) => t.id === id)

    const makeTask = (n: NewTask): Task => {
      const t = now()
      return {
        id: uid(),
        title: n.title,
        priority: n.priority ?? 'mid',
        dueDate: n.dueDate ?? null,
        estimateMin: n.estimateMin ?? null,
        firstStep: n.firstStep ?? '',
        status: 'todo',
        plannedDate: n.plannedDate ?? null,
        parentId: n.parentId ?? null,
        postponeCount: 0,
        createdAt: t,
        updatedAt: t,
        startedAt: null,
        completedAt: null,
        deletedAt: null,
      }
    }

    /** 子タスクがすべて完了したら親も完了にする */
    const parentOps = (changed: Task): WriteOp[] => {
      if (!changed.parentId) return []
      const parent = getTask(changed.parentId)
      if (!parent || parent.status === 'done') return []
      const siblings = dataRef.current.tasks.filter((t) => t.parentId === parent.id && !t.deletedAt).map((t) => (t.id === changed.id ? changed : t))
      if (siblings.length && siblings.every((t) => t.status === 'done')) {
        return [{ store: 'tasks', put: { ...parent, status: 'done', completedAt: changed.completedAt ?? now(), updatedAt: now() } }]
      }
      return []
    }

    return {
      async addTask(n: NewTask): Promise<Task | null> {
        const task = makeTask(n)
        return (await commit([{ store: 'tasks', put: task }], 'タスクを追加しました')) ? task : null
      },
      updateTask(task: Task, msg = '保存しました') {
        return commit([{ store: 'tasks', put: { ...task, updatedAt: now() } }], msg)
      },
      deleteTask(id: string) {
        const t = now()
        const targets = dataRef.current.tasks.filter((x) => x.id === id || x.parentId === id)
        return commit(targets.map((x) => ({ store: 'tasks', put: { ...x, deletedAt: t, updatedAt: t } })), 'タスクを削除しました')
      },
      setStatus(id: string, status: TaskStatus) {
        const task = getTask(id)
        if (!task) return Promise.resolve(false)
        const t = now()
        const next: Task = {
          ...task,
          status,
          updatedAt: t,
          startedAt: status === 'doing' || status === 'done' ? (task.startedAt ?? t) : task.startedAt,
          completedAt: status === 'done' ? t : null,
        }
        return commit([{ store: 'tasks', put: next }, ...parentOps(next)], status === 'done' ? '完了しました' : undefined)
      },
      async splitTask(parentId: string, children: { title: string; estimateMin: number | null }[], plannedDate: ISODate | null) {
        const parent = getTask(parentId)
        if (!parent) return false
        const kids = children.map((c, i) =>
          makeTask({
            title: c.title,
            estimateMin: c.estimateMin,
            priority: parent.priority,
            dueDate: parent.dueDate,
            plannedDate,
            parentId,
            firstStep: i === 0 ? parent.firstStep : '',
          }),
        )
        return commit(
          [...kids.map((k, i) => ({ store: 'tasks' as const, put: { ...k, createdAt: k.createdAt + i } })), { store: 'tasks', put: { ...parent, status: parent.status === 'postponed' ? 'todo' : parent.status, updatedAt: now() } }],
          `${kids.length}個に分割しました`,
        )
      },
      triage(id: string, action: Exclude<TriageAction, 'split'>, postponeTo?: ISODate) {
        const task = getTask(id)
        if (!task) return Promise.resolve(false)
        const ops: WriteOp[] = [{ store: 'tasks', put: applyTriage(task, action, todayNow(), now(), postponeTo) }]
        if (action === 'delete') for (const c of dataRef.current.tasks.filter((x) => x.parentId === id)) ops.push({ store: 'tasks', put: { ...c, deletedAt: now() } })
        return commit(ops)
      },

      saveCheckin(input: Omit<DailyCheckIn, 'createdAt' | 'updatedAt' | 'topTitles'>) {
        const prev = dataRef.current.checkins.find((c) => c.date === input.date)
        const t = now()
        const topTitles: Record<string, string> = {}
        const ops: WriteOp[] = []
        for (const id of input.topTaskIds) {
          const task = getTask(id)
          if (!task) continue
          topTitles[id] = task.title
          if (task.plannedDate !== input.date || task.status === 'postponed')
            ops.push({ store: 'tasks', put: { ...task, plannedDate: input.date, status: task.status === 'postponed' ? 'todo' : task.status, updatedAt: t } })
        }
        const rec: DailyCheckIn = { ...input, topTitles, createdAt: prev?.createdAt ?? t, updatedAt: t }
        return commit([{ store: 'checkins', put: rec }, ...ops], prev ? 'チェックインを更新しました' : 'チェックイン完了')
      },
      saveReview(r: Omit<DailyReview, 'createdAt' | 'updatedAt'>) {
        const prev = dataRef.current.reviews.find((x) => x.date === r.date)
        const t = now()
        return commit([{ store: 'reviews', put: { ...r, createdAt: prev?.createdAt ?? t, updatedAt: t } }], prev ? '振り返りを更新しました' : '振り返りを保存しました')
      },

      saveHabit(h: Omit<Habit, 'id' | 'createdAt' | 'order' | 'archived'> & Partial<Habit>) {
        const prev = h.id ? dataRef.current.habits.find((x) => x.id === h.id) : undefined
        const rec: Habit = {
          id: prev?.id ?? uid(),
          name: h.name,
          minimum: h.minimum,
          weekdays: h.weekdays,
          archived: h.archived ?? prev?.archived ?? false,
          createdAt: prev?.createdAt ?? now(),
          order: prev?.order ?? dataRef.current.habits.length,
        }
        return commit([{ store: 'habits', put: rec }], prev ? '習慣を更新しました' : '習慣を追加しました')
      },
      deleteHabit(id: string) {
        const logs = dataRef.current.habitLogs.filter((l) => l.habitId === id)
        return commit([{ store: 'habits', delete: id }, ...logs.map((l) => ({ store: 'habitLogs' as const, delete: l.key }))], '習慣と記録を削除しました')
      },
      toggleHabit(habitId: string, date: ISODate) {
        const key = `${habitId}|${date}`
        const prev = dataRef.current.habitLogs.find((l) => l.key === key)
        return commit([{ store: 'habitLogs', put: { key, habitId, date, done: !prev?.done, updatedAt: now() } }])
      },

      async startFocus(taskId: string | null, plannedMin: number, kind: FocusKind = 'focus'): Promise<FocusSession | null> {
        const running = dataRef.current.focusSessions.find((s) => s.status === 'running' || s.status === 'paused')
        if (running) {
          toast('実行中のタイマーがあります。先に終了してください', 'error')
          return null
        }
        const t = now()
        const s = timer.createSession({ id: uid(), now: t, plannedMin, taskId, kind, date: todayNow() })
        const ops: WriteOp[] = [{ store: 'focusSessions', put: s }]
        const task = taskId ? getTask(taskId) : undefined
        if (task && task.status !== 'doing' && task.status !== 'done') ops.push({ store: 'tasks', put: { ...task, status: 'doing', startedAt: task.startedAt ?? t, updatedAt: t } })
        return (await commit(ops)) ? s : null
      },
      saveFocus(s: FocusSession) {
        return commit([{ store: 'focusSessions', put: s }])
      },
      async finishFocus(s: FocusSession, status: 'completed' | 'stopped'): Promise<FocusSession | null> {
        const f = timer.finish(s, now(), status)
        return (await commit([{ store: 'focusSessions', put: f }])) ? f : null
      },

      upsert<K extends StoreName>(store: K, rec: DataSet[K][number], msg = '記録しました') {
        return commit([{ store, put: { ...(rec as object), updatedAt: now() } }], msg)
      },
      removeRecord(store: StoreName, key: string, msg = '削除しました') {
        return commit([{ store, delete: key }], msg)
      },
      addExpense(e: Omit<ExpenseRecord, 'id' | 'createdAt'>) {
        return commit([{ store: 'expenseRecords', put: { ...e, id: uid(), createdAt: now() } }], '支出を記録しました')
      },
      updateSettings(patch: Partial<Settings>, msg?: string) {
        const cur = dataRef.current.settings[0] ?? DEFAULT_SETTINGS
        return commit([{ store: 'settings', put: { ...cur, ...patch, key: 'settings' } }], msg)
      },
      async importData(d: DataSet) {
        try {
          await replaceAll(d)
          setData(d)
          dataRef.current = d
          toast('データを読み込みました')
          return true
        } catch (e) {
          toast(`読み込みに失敗しました（元のデータは残っています）：${e instanceof Error ? e.message : String(e)}`, 'error')
          return false
        }
      },
      async clearAllData() {
        try {
          await clearAll()
          const d = emptyData()
          setData(d)
          dataRef.current = d
          toast('すべてのデータを削除しました')
          return true
        } catch (e) {
          toast(`削除に失敗しました：${e instanceof Error ? e.message : String(e)}`, 'error')
          return false
        }
      },
    }
  }, [commit, toast])

  return { data, settings, today, ready, loadError, toasts, toast, actions }
}

export type Store = ReturnType<typeof useProvideStore>
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useProvideStore()
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider がありません')
  return s
}
