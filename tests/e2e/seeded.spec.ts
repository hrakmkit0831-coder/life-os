import { expect, test } from '@playwright/test'

// 14日分の記録を JSON インポートで投入し、分析とホームの表示を確認する
function seed() {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(2026, 9, 2 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const tasks: unknown[] = []
  const checkins: unknown[] = []
  const sleepRecords: unknown[] = []
  const screenTimeRecords: unknown[] = []
  const expenseRecords: unknown[] = []
  const reviews: unknown[] = []
  days.forEach((date, i) => {
    const good = i % 3 !== 0
    const id = `t${i}`
    const t = new Date(`${date}T20:00:00+09:00`).getTime()
    tasks.push({ id, title: `${date} の重要タスク`, priority: 'high', dueDate: null, estimateMin: 30, firstStep: '', status: good ? 'done' : 'postponed', plannedDate: good ? date : null, parentId: null, postponeCount: good ? 0 : 1, createdAt: t - 3.6e7, updatedAt: t, startedAt: null, completedAt: good ? t : null, deletedAt: null })
    checkins.push({ date, energy: 'mid', mitTaskId: id, topTaskIds: [id], topTitles: {}, notDoing: '', constraints: '', availableMin: null, createdAt: t, updatedAt: t })
    sleepRecords.push({ date, bedTime: good ? '23:30' : '02:00', wakeTime: '07:00', durationMin: good ? 450 : 300, updatedAt: t })
    screenTimeRecords.push({ date, snsMin: good ? 40 : 180, gameMin: good ? 0 : 60, videoMin: 20, updatedAt: t })
    expenseRecords.push({ id: `e${i}`, date, amount: 800 + i * 50, category: '食費', memo: '', createdAt: t })
    if (!good) reviews.push({ date, mitDone: false, achieved: '', missed: '', causes: ['phone', 'sleep'], note: '', improvement: 'スマホを別室に置く', plannedTopCount: 1, doneTopCount: 0, plannedMin: 30, actualFocusMin: 0, createdAt: t, updatedAt: t })
  })
  return { app: 'life-os', schemaVersion: 1, exportedAt: new Date().toISOString(), data: { tasks, checkins, sleepRecords, screenTimeRecords, expenseRecords, reviews, habits: [], habitLogs: [], focusSessions: [], exerciseRecords: [], healthRecords: [], timeRecords: [], settings: [] } }
}

test('記録があると、分母つきの完了率・グラフ・根拠つきの傾向が表示される', async ({ page }, info) => {
  page.on('dialog', (d) => d.accept())
  await page.clock.install({ time: new Date('2026-10-15T21:00:00+09:00') })
  await page.goto('/#/settings')
  await page.getByTestId('import-file').setInputFiles({ name: 'seed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed())) })
  await page.getByRole('button', { name: '置き換えて読み込む' }).click()
  await expect(page.getByText('データを読み込みました')).toBeVisible()

  await page.goto('/#/stats')
  await expect(page.getByText('7件中 5件')).toBeVisible()
  await expect(page.locator('svg[role="img"]')).toHaveCount(3)

  await page.locator('svg[role="img"]').first().locator('g').nth(6).click()
  await expect(page.locator('.tip')).toContainText('10/15')
  await page.getByRole('button', { name: '直近30日' }).click()
  await expect(page.getByText(/睡眠：.*完了率が高い傾向/)).toBeVisible()
  await expect(page.getByText('仮説').first()).toBeVisible()
  await page.screenshot({ path: `test-results/screens/${info.project.name}_seeded_stats.png`, fullPage: true })

  await page.goto('/#/')
  await expect(page.getByText('繰り返している原因')).toBeVisible()
  await page.screenshot({ path: `test-results/screens/${info.project.name}_seeded_home.png`, fullPage: true })
})
