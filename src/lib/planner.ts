// ルールベースの1日計画とタスク分解の提案（外部AIは使わない）
import { diffDays } from './date'
import type { Energy, ISODate, Task } from './types'

export const ENERGY_LABEL: Record<Energy, string> = { low: '低い', mid: '普通', high: '高い' }

/** エネルギー別：重要タスク上限・既定の使える時間・集中ブロック */
export const ENERGY_RULES: Record<Energy, { maxTop: number; defaultAvailableMin: number; block: number }> = {
  low: { maxTop: 1, defaultAvailableMin: 120, block: 15 },
  mid: { maxTop: 2, defaultAvailableMin: 240, block: 25 },
  high: { maxTop: 3, defaultAvailableMin: 360, block: 45 },
}

export const MAX_TOP = 3
/** 中断や移動を考えて、使える時間の6割だけを計画に充てる */
export const CAPACITY_RATIO = 0.6
/** 推定時間が未入力のタスクは30分として扱う */
export const UNKNOWN_ESTIMATE = 30

export function hasOpenChildren(task: Task, all: Task[]): boolean {
  return all.some((t) => t.parentId === task.id && !t.deletedAt && t.status !== 'done')
}

/** 今日の計画候補: 未完了・未削除・予定日が今日以前（または未定） */
export function candidates(tasks: Task[], today: ISODate): Task[] {
  return tasks
    .filter((t) => !t.deletedAt && t.status !== 'done' && !hasOpenChildren(t, tasks))
    .filter((t) => t.plannedDate == null || t.plannedDate <= today)
    .sort((a, b) => score(b, today) - score(a, today))
}

export function score(t: Task, today: ISODate): number {
  let s = 0
  if (t.dueDate) {
    const d = diffDays(t.dueDate, today)
    if (d < 0) s += 100
    else if (d === 0) s += 80
    else if (d <= 2) s += 50
    else if (d <= 7) s += 20
  }
  s += t.priority === 'high' ? 40 : t.priority === 'mid' ? 20 : 0
  if (t.plannedDate === today) s += 15
  if (t.status === 'doing') s += 10
  return s
}

export interface PlanInput {
  energy: Energy
  availableMin: number | null
  tasks: Task[]
  today: ISODate
  mitTaskId: string | null
}

export interface Plan {
  mitTaskId: string | null
  topTaskIds: string[]
  maxTop: number
  plannedMin: number
  capacityMin: number
  blockMin: number
  warnings: string[]
  tips: string[]
}

export function buildPlan(p: PlanInput): Plan {
  const rule = ENERGY_RULES[p.energy]
  const available = p.availableMin ?? rule.defaultAvailableMin
  const capacityMin = Math.round(available * CAPACITY_RATIO)
  const list = candidates(p.tasks, p.today)
  const est = (t: Task) => t.estimateMin ?? UNKNOWN_ESTIMATE
  const warnings: string[] = []
  const tips: string[] = []

  const mit = (p.mitTaskId && list.find((t) => t.id === p.mitTaskId)) || list[0] || null
  const top: Task[] = mit ? [mit] : []
  let total = mit ? est(mit) : 0

  for (const t of list) {
    if (top.length >= rule.maxTop) break
    if (top.includes(t)) continue
    if (total + est(t) > capacityMin) continue
    top.push(t)
    total += est(t)
  }

  if (mit && est(mit) > capacityMin) warnings.push(`最重要タスクの推定時間（${est(mit)}分）が今日の実行可能時間（約${capacityMin}分）を超えています。分割して今日の分だけを決めてください。`)
  if (mit && est(mit) > 90) warnings.push('最重要タスクが90分を超えています。分割すると着手しやすくなります。')
  if (top.some((t) => t.estimateMin == null)) tips.push('推定時間が未入力のタスクは30分として計算しています。')
  if (top.some((t) => !t.firstStep.trim())) tips.push('「最初の5分」が空のタスクがあります。書いておくと迷わず始められます。')

  if (p.energy === 'low') {
    tips.unshift('エネルギーが低い日：重要タスクは1件だけ。最初の5分に着手できれば今日は前進です。習慣は「最低ライン」で十分です。')
  } else if (p.energy === 'high') {
    tips.unshift('エネルギーが高い日：最重要タスクを最初の集中ブロックで片付けましょう。')
  }
  if (list.length === 0) tips.push('候補タスクがありません。最重要タスクを新しく1つ書いてください。')

  return {
    mitTaskId: mit?.id ?? null,
    topTaskIds: top.map((t) => t.id),
    maxTop: rule.maxTop,
    plannedMin: total,
    capacityMin,
    blockMin: rule.block,
    warnings,
    tips,
  }
}

// ---- タスク分解の提案 ----

const VAGUE = /(進める|やる|頑張る|整理|準備|対応|検討|考える|まとめる|作る|勉強|片付け)/
const TEMPLATES: { re: RegExp; steps: string[] }[] = [
  { re: /(資料|企画|書類|レポート|原稿|台本|記事|文章|ブログ|スライド)/, steps: ['関連ファイルを開いて見出しだけ書く（5分）', '見出しごとに箇条書きで中身を出す（25分）', '文章として整える（25分）', '見直して保存・提出する（15分）'] },
  { re: /(勉強|学習|試験|復習|予習|資格|英語)/, steps: ['教材を開いて今日の範囲を1つ決める（5分）', '範囲を1セクション読む（25分）', '問題を5問解く（25分）', '間違えた所を1行メモする（10分）'] },
  { re: /(掃除|片付け|整理|洗濯|部屋)/, steps: ['ゴミ袋を1枚出して目に入るゴミを捨てる（5分）', '1か所だけ片付ける（15分）', '次の1か所を片付ける（15分）'] },
  { re: /(メール|連絡|返信|電話|LINE|DM)/, steps: ['相手と用件を1行で書く（5分）', '本文を書く（10分）', '送信する（2分）'] },
  { re: /(応募|申請|手続|申込|届|確定申告|請求)/, steps: ['必要な書類・URLを確認してリストにする（5分）', '入力・記入する（25分）', '確認して提出する（10分）'] },
  { re: /(動画|編集|撮影|制作|デザイン|MV)/, steps: ['素材フォルダを開いて構成を3行で書く（5分）', '最初のパートを作る（25分）', '次のパートを作る（25分）', '書き出して確認する（15分）'] },
]
const DEFAULT_STEPS = ['必要な物・ファイルを開く（5分）', '最初の区切りまで進める（25分）', '次の区切りまで進める（25分）', '仕上げと確認（15分）']

export interface Breakdown {
  tooBig: boolean
  reasons: string[]
  steps: string[]
  starter: string
}

export function suggestBreakdown(t: Pick<Task, 'title' | 'estimateMin' | 'firstStep'>): Breakdown {
  const reasons: string[] = []
  if (t.estimateMin != null && t.estimateMin > 60) reasons.push(`推定${t.estimateMin}分：60分を超えるタスクは途中で止まりやすくなります`)
  if (VAGUE.test(t.title) && t.title.length <= 12) reasons.push('「進める」「準備」などの言葉だけだと、何をすれば完了か曖昧です')
  if (!t.firstStep.trim()) reasons.push('最初の5分の行動が決まっていません')
  const steps = TEMPLATES.find((x) => x.re.test(t.title))?.steps ?? DEFAULT_STEPS
  return {
    tooBig: reasons.length > 0 && (t.estimateMin == null || t.estimateMin > 60 || VAGUE.test(t.title)),
    reasons,
    steps,
    starter: t.firstStep.trim() || steps[0],
  }
}
