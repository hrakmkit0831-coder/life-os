import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// 2026-10-15（木）10:00 JST に固定
const T0 = new Date('2026-10-15T10:00:00+09:00')

async function open(page: Page, hash = '/') {
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '削除' : undefined))
  await page.clock.install({ time: T0 })
  await page.goto(`/#${hash}`)
  await expect(page.locator('.loading')).toHaveCount(0)
}

async function addTask(page: Page, title: string, opts: { est?: string; first?: string } = {}) {
  await page.goto('/#/do')
  await page.getByRole('button', { name: '追加' }).first().click()
  await page.getByLabel('タスク名（完了したと判断できる書き方で）').fill(title)
  if (opts.first) await page.getByLabel('最初の5分でやること').fill(opts.first)
  if (opts.est) await page.getByLabel('推定所要時間（分）').fill(opts.est)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('タスクの追加・編集・完了・削除とリロード後のデータ保持', async ({ page }) => {
  await open(page, '/do')
  await addTask(page, '請求書を作成して送る', { est: '30', first: 'テンプレートを開く' })
  await expect(page.getByText('請求書を作成して送る')).toBeVisible()

  // 編集
  await page.getByText('請求書を作成して送る').click()
  await page.getByRole('button', { name: '編集' }).click()
  await page.getByLabel('タスク名（完了したと判断できる書き方で）').fill('請求書を作成して田中さんに送る')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('請求書を作成して田中さんに送る')).toBeVisible()

  // リロードしても残る
  await page.reload()
  await expect(page.getByText('請求書を作成して田中さんに送る')).toBeVisible()

  // 完了
  await page.getByRole('checkbox', { name: /請求書を作成して田中さんに送るを完了にする/ }).click()
  await page.getByRole('button', { name: '完了', exact: true }).click()
  await expect(page.locator('.task.done', { hasText: '請求書を作成して田中さんに送る' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '完了', exact: true }).click()
  await expect(page.locator('.task.done', { hasText: '請求書を作成して田中さんに送る' })).toBeVisible()

  // 削除
  await page.getByText('請求書を作成して田中さんに送る').click()
  await page.getByRole('button', { name: '削除' }).click()
  await expect(page.getByText('請求書を作成して田中さんに送る')).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: '完了', exact: true }).click()
  await expect(page.getByText('請求書を作成して田中さんに送る')).toHaveCount(0)
})

test('ホームで最重要タスクを決めて5分だけ始める → タイマーはリロード後も正確', async ({ page }) => {
  await open(page)
  await page.getByRole('textbox', { name: '最重要タスク' }).fill('企画書の見出しを5つ書く')
  await page.getByRole('button', { name: '25分' }).click()
  await page.getByRole('button', { name: 'これに決める' }).click()
  await expect(page.getByRole('region', { name: '次にやること' })).toContainText('企画書の見出しを5つ書く')

  await page.getByRole('button', { name: '5分だけ始める' }).click()
  await expect(page.getByTestId('remaining')).toHaveText('05:00')
  await page.clock.fastForward('02:00')
  await expect(page.getByTestId('remaining')).toHaveText('03:00')

  await page.reload()
  await expect(page.getByTestId('remaining')).toHaveText('03:00')

  await page.clock.fastForward('03:01')
  await expect(page.getByText('時間です')).toBeVisible()
  await page.getByRole('button', { name: '記録して終える' }).click()
  await expect(page.locator('.huge')).toHaveText('5')
  await page.getByRole('button', { name: /を完了にする/ }).click()
  await expect(page.getByText('1件すべて完了しました')).toBeVisible()
})

test('日付が変わると新しい日になり、前日の未完了は自動で持ち越さず仕分けを求める', async ({ page }) => {
  await open(page)
  await page.getByRole('textbox', { name: '最重要タスク' }).fill('部屋の床の物を片付ける')
  await page.getByRole('button', { name: '15分' }).click()
  await page.getByRole('button', { name: 'これに決める' }).click()
  await expect(page.getByRole('heading', { name: '10月15日（木）' })).toBeVisible()

  // 翌日 3:00 はまだ15日扱い（切り替えは4時）
  await page.clock.fastForward('17:00:00')
  await page.reload()
  await expect(page.getByRole('heading', { name: '10月15日（木）' })).toBeVisible()

  // 翌日 5:00 → 16日
  await page.clock.fastForward('02:00:00')
  await page.reload()
  await expect(page.getByRole('heading', { name: '10月16日（金）' })).toBeVisible()
  await expect(page.getByText('未チェックイン')).toBeVisible()
  await expect(page.getByText('未完了の仕分け')).toBeVisible()
  await page.getByRole('button', { name: '仕分ける' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '今日やる' }).click()
  await expect(page.getByRole('dialog').getByText('仕分けが必要なタスクはありません')).toBeVisible()
})

test('習慣の実施記録', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '＋追加' }).click()
  await page.getByLabel('習慣名').fill('筋トレ')
  await page.getByLabel('最低ライン（できない日でもこれだけはやる）').fill('腕立て1回')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const habit = page.locator('.habit', { hasText: '筋トレ' })
  await expect(habit).toHaveAttribute('aria-pressed', 'false')
  await habit.click()
  await expect(habit).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.locator('.habit', { hasText: '筋トレ' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.stat', { hasText: '習慣' })).toContainText('1/1')
})

test('支出の記録と日・週・月の集計、入力検証', async ({ page }) => {
  await open(page, '/life')
  await page.getByRole('button', { name: 'お金' }).click()
  await page.getByLabel('金額（円）').fill('abc')
  await page.getByRole('button', { name: '追加' }).click()
  await expect(page.getByText('金額は0以上の整数（円）で入力してください')).toBeVisible()

  await page.getByLabel('金額（円）').fill('1,200')
  await page.getByRole('button', { name: '外食' }).click()
  await page.getByRole('button', { name: '追加' }).click()
  await page.getByLabel('金額（円）').fill('３００')
  await page.getByRole('button', { name: '追加' }).click()
  await expect(page.getByTestId('total-day')).toHaveText('¥1,500')

  // 前日（同じ週・同じ月）
  await page.getByRole('button', { name: '前の日' }).click()
  await page.getByLabel('金額（円）').fill('500')
  await page.getByRole('button', { name: '追加' }).click()
  await expect(page.getByTestId('total-day')).toHaveText('¥500')
  await expect(page.getByTestId('total-week')).toHaveText('¥2,000')
  await expect(page.getByTestId('total-month')).toHaveText('¥2,000')
  await page.reload()
  await page.getByRole('button', { name: 'お金' }).click()
  await expect(page.getByTestId('total-month')).toHaveText('¥2,000')
})

test('睡眠の日付またぎ計算', async ({ page }) => {
  await open(page, '/life')
  await page.getByLabel('就寝時刻').fill('23:30')
  await page.getByLabel('起床時刻').fill('07:00')
  await expect(page.locator('.card', { hasText: '睡眠時間' }).first()).toContainText('7時間30分')
  await page.getByRole('button', { name: '記録', exact: true }).click()
  await expect(page.getByText('記録済み')).toBeVisible()
})

test('データのエクスポート → 全削除 → インポートで復元', async ({ page }) => {
  await open(page, '/do')
  await addTask(page, 'バックアップ確認用タスク', { est: '20' })
  await page.goto('/#/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSON で書き出す（バックアップ）' }).click()])
  const path = await download.path()
  const json = JSON.parse(readFileSync(path!, 'utf8'))
  expect(json.app).toBe('life-os')
  expect(json.data.tasks.some((t: { title: string }) => t.title === 'バックアップ確認用タスク')).toBe(true)

  await page.getByRole('button', { name: 'すべてのデータを削除' }).click()
  await expect(page.getByText('すべてのデータを削除しました')).toBeVisible()
  await page.goto('/#/do')
  await page.getByRole('button', { name: 'すべて' }).click()
  await expect(page.getByText('バックアップ確認用タスク')).toHaveCount(0)

  // 不正なファイルは拒否
  await page.goto('/#/settings')
  await page.getByTestId('import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"x"}') })
  await expect(page.getByText(/読み込めません/)).toBeVisible()

  await page.getByTestId('import-file').setInputFiles(path!)
  await expect(page.getByText('読み込み内容の確認')).toBeVisible()
  await page.getByRole('button', { name: '置き換えて読み込む' }).click()
  await expect(page.getByText('データを読み込みました')).toBeVisible()
  await page.reload()
  await page.goto('/#/do')
  await page.getByRole('button', { name: 'すべて' }).click()
  await expect(page.getByText('バックアップ確認用タスク')).toBeVisible()
})

test('朝のチェックイン（Strict Mode は推定時間を要求）→ 夜の振り返り', async ({ page }) => {
  await open(page, '/checkin')
  await page.getByRole('button', { name: '低い' }).click()
  await page.getByLabel('新しいタスク').fill('メールを3通返す')
  await page.getByRole('button', { name: '追加', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click()
  await page.getByRole('button', { name: 'この計画で始める' }).click()
  await expect(page.getByRole('alert')).toContainText('推定時間を入れてください')

  await page.locator('.task', { hasText: 'メールを3通返す' }).locator('.body').click()
  await page.getByLabel('推定所要時間（分）').fill('15')
  await page.getByLabel('最初の5分でやること').fill('受信箱を開く')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('button', { name: 'この計画で始める' }).click()
  await expect(page.getByText('チェックイン済み・エネルギー低')).toBeVisible()

  await page.goto('/#/review')
  await page.getByRole('button', { name: '振り返りを保存' }).click()
  await expect(page.getByRole('alert')).toContainText('明日改善すること')
  await page.getByRole('button', { name: 'スマホを見すぎた' }).click()
  await page.getByRole('button', { name: '明日やる' }).click()
  await page.getByRole('button', { name: '作業中はスマホを別の部屋かカバンの中に置く' }).click()
  await page.getByRole('button', { name: '振り返りを保存' }).click()
  await expect(page.getByText('振り返りを保存しました')).toBeVisible()
  await expect(page.getByText('明日の改善：作業中はスマホを別の部屋かカバンの中に置く')).toBeVisible()
})

test('立て直しモード：仕分け → 1つ決める → 5分で始める', async ({ page }) => {
  await open(page, '/reset')
  await page.getByRole('button', { name: '次へ：今日の1つを決める' }).click()
  await page.getByLabel('今日やる1つ').fill('洗濯機を回す')
  await page.getByRole('button', { name: '次へ：5分の行動にする' }).click()
  await page.getByLabel('最初の5分の行動').fill('洗濯物をカゴから入れる')
  await page.getByRole('button', { name: '次へ', exact: true }).click()
  await page.getByRole('button', { name: '5分だけ始める' }).click()
  await expect(page.getByTestId('remaining')).toHaveText('05:00')
  await expect(page.getByText('最初の5分：洗濯物をカゴから入れる')).toBeVisible()
})

test('分析：データがなければ架空の値を出さず記録を促す', async ({ page }) => {
  await open(page, '/stats')
  await expect(page.getByText('チェックインの記録がまだありません')).toBeVisible()
  await expect(page.getByText('睡眠の記録がまだありません')).toBeVisible()
  await expect(page.locator('svg[role="img"]')).toHaveCount(0)
})

test('Apple Watch の睡眠をショートカット経由（クリップボード）で取り込む', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => 'LIFEOS睡眠\n2026-10-14 23:42\n2026-10-15 07:05' } })
  })
  await open(page, '/life')
  await page.getByRole('button', { name: 'ヘルスケアから取り込む' }).click()
  await expect(page.getByText('23:42 → 07:05（7時間23分）')).toBeVisible()
  await page.getByRole('button', { name: '記録する' }).click()
  await expect(page.getByText('ヘルスケアの睡眠を記録しました')).toBeVisible()
  await expect(page.getByLabel('就寝時刻')).toHaveValue('23:42')
  await expect(page.getByLabel('起床時刻')).toHaveValue('07:05')
  await page.reload()
  await expect(page.getByText('23:42 → 07:05')).toBeVisible()
  await page.getByRole('button', { name: '設定方法' }).click()
  await expect(page.getByRole('dialog', { name: 'ショートカットの作り方' })).toContainText('ヘルスケアサンプルを検索')
})
