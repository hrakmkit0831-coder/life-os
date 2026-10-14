// LIFE OS データモデル
// 日付は「論理日付」YYYY-MM-DD（設定の dayStartHour 時刻で日が切り替わる）。日時は epoch ミリ秒。

export type ISODate = string // 'YYYY-MM-DD'

export type TaskStatus = 'todo' | 'doing' | 'done' | 'postponed'
export type Priority = 'high' | 'mid' | 'low'

export interface Task {
  id: string
  title: string
  priority: Priority
  dueDate: ISODate | null
  estimateMin: number | null
  firstStep: string // 最初の5分で実行すること
  status: TaskStatus
  plannedDate: ISODate | null // いつ実行する予定か（null = いつかやる）
  parentId: string | null // 分割元タスク
  postponeCount: number
  createdAt: number
  updatedAt: number
  startedAt: number | null
  completedAt: number | null
  deletedAt: number | null // 削除は論理削除（分析の分母を正しく保つため）
}

export interface Habit {
  id: string
  name: string
  minimum: string // 最低ライン（例: 腕立て1回）
  weekdays: number[] // 0=日 … 6=土
  archived: boolean
  createdAt: number
  order: number
}

// 1習慣×1日 = 1レコード。キーは `${habitId}|${date}`
export interface HabitLog {
  key: string
  habitId: string
  date: ISODate
  done: boolean
  updatedAt: number
}

export type Energy = 'low' | 'mid' | 'high'

// 1日1件。同じ日に再入力すると上書き（updatedAt更新）
export interface DailyCheckIn {
  date: ISODate
  energy: Energy
  mitTaskId: string | null // 最重要タスク
  topTaskIds: string[] // 重要タスク（MITを含め最大3件）
  topTitles: Record<string, string> // 確定時点のタイトル（分析用スナップショット）
  notDoing: string
  constraints: string
  availableMin: number | null
  createdAt: number
  updatedAt: number
}

export type Cause =
  | 'phone'
  | 'sleep'
  | 'too_big'
  | 'overplanned'
  | 'environment'
  | 'unexpected'
  | 'unclear'
  | 'other'

export interface DailyReview {
  date: ISODate
  mitDone: boolean | null
  achieved: string
  missed: string
  causes: Cause[]
  note: string
  improvement: string
  plannedTopCount: number
  doneTopCount: number
  plannedMin: number // 計画（重要タスクの推定時間合計）
  actualFocusMin: number // 実績（集中セッション合計）
  createdAt: number
  updatedAt: number
}

export type FocusKind = 'focus' | 'starter'
export type FocusStatus = 'running' | 'paused' | 'completed' | 'stopped'

export interface FocusSession {
  id: string
  taskId: string | null
  kind: FocusKind
  date: ISODate
  startAt: number
  plannedMin: number
  plannedEndAt: number // 一時停止すると後ろへずれる
  pausedAt: number | null
  pausedTotalMs: number
  endedAt: number | null
  actualMin: number | null
  status: FocusStatus
}

// 起床した日の論理日付に紐づける。就寝が前日でも同じレコード
export interface SleepRecord {
  date: ISODate
  bedTime: string // 'HH:MM'
  wakeTime: string // 'HH:MM'
  durationMin: number
  updatedAt: number
}

export interface ExerciseRecord {
  date: ISODate
  exercised: boolean
  minutes: number
  kind: string
  updatedAt: number
}

export interface HealthRecord {
  date: ISODate
  meals: string
  condition: number | null // 1..5
  updatedAt: number
}

export interface TimeRecord {
  date: ISODate
  studyMin: number
  workMin: number
  updatedAt: number
}

// iPhone のスクリーンタイムは Web から取得できないため手入力
export interface ScreenTimeRecord {
  date: ISODate
  snsMin: number
  gameMin: number
  videoMin: number
  updatedAt: number
}

export interface ExpenseRecord {
  id: string
  date: ISODate
  amount: number // 円（整数）
  category: string
  memo: string
  createdAt: number
}

export interface Settings {
  key: 'settings'
  strictMode: boolean
  dayStartHour: number // 0..6
  sleepGoalMin: number
  bedTarget: string
  wakeTarget: string
  lastExportAt: number | null
}

export interface DataSet {
  tasks: Task[]
  habits: Habit[]
  habitLogs: HabitLog[]
  checkins: DailyCheckIn[]
  reviews: DailyReview[]
  focusSessions: FocusSession[]
  sleepRecords: SleepRecord[]
  exerciseRecords: ExerciseRecord[]
  healthRecords: HealthRecord[]
  timeRecords: TimeRecord[]
  screenTimeRecords: ScreenTimeRecord[]
  expenseRecords: ExpenseRecord[]
  settings: Settings[]
}

export type StoreName = keyof DataSet

export const STORE_KEYS: Record<StoreName, string> = {
  tasks: 'id',
  habits: 'id',
  habitLogs: 'key',
  checkins: 'date',
  reviews: 'date',
  focusSessions: 'id',
  sleepRecords: 'date',
  exerciseRecords: 'date',
  healthRecords: 'date',
  timeRecords: 'date',
  screenTimeRecords: 'date',
  expenseRecords: 'id',
  settings: 'key',
}

export const STORE_NAMES = Object.keys(STORE_KEYS) as StoreName[]

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  strictMode: true,
  dayStartHour: 4,
  sleepGoalMin: 420,
  bedTarget: '23:30',
  wakeTarget: '06:30',
  lastExportAt: null,
}

export const CAUSE_LABELS: Record<Cause, string> = {
  phone: 'スマホを見すぎた',
  sleep: '睡眠不足だった',
  too_big: 'タスクが大きすぎた',
  overplanned: '計画を詰め込みすぎた',
  environment: '集中できる環境がなかった',
  unexpected: '予定外の用事が入った',
  unclear: '何から始めるか不明確だった',
  other: 'その他',
}

export const EXPENSE_CATEGORIES = ['食費', '外食', '日用品', '交通', '娯楽', 'ゲーム・課金', '交際', '学習', '固定費', 'その他']
